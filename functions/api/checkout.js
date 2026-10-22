import { json, bad, readJson, uid, token } from '../_lib/util.js';
import { normWpp, validPin, newPin } from '../_lib/pin.js';
import { encryptPin } from '../_lib/secret.js';
import { getConfig, getOrder } from '../_lib/db.js';
import { eventBySlug } from '../_lib/events.js';
import { PAID } from '../_lib/access.js';
import { isPresale, allPrice, cartPrice, reais, salesOpen, packLimit, packExtra } from '../_lib/pricing.js';
import { createPreference } from '../_lib/mp.js';

const MAX_PHOTOS = 300;

// { athleteId?, all?, photoIds?, name, whatsapp, email? } -> { token, url }
export async function onRequestPost({ request, env }) {
  if (!env.MP_ACCESS_TOKEN) return bad('Pagamento ainda não configurado.', 503);
  const b = await readJson(request);
  if (b.x) return extras(b, request, env);
  const name = String(b.name || '').trim().slice(0, 120);
  const whatsapp = normWpp(b.whatsapp);
  const email = String(b.email || '').trim().slice(0, 160);
  if (name.length < 2) return bad('Informe seu nome.');
  if (whatsapp.length < 10 || whatsapp.length > 13) return bad('Informe um WhatsApp válido com DDD.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad('Informe um e-mail válido: é para ele que enviamos sua senha e o link.');
  if (!validPin(b.pin)) return bad('Crie uma senha de 4 a 6 números.');

  const ev = await eventBySlug(env, b.e);
  if (!ev) return bad('Evento não encontrado.', 404);
  const cfg = await getConfig(env, ev.id);
  if (ev.archived || !salesOpen(cfg)) return bad('As vendas foram encerradas.', 410);
  const now = Date.now();
  let athlete = null;
  if (b.athleteId) {
    athlete = await env.DB.prepare('SELECT id, name FROM athletes WHERE id = ? AND event_id = ?').bind(Number(b.athleteId), ev.id).first();
    if (!athlete) return bad('Atleta não encontrado.');
  }

  let kind, amount, photoIds = [], title;
  if (b.all) {
    if (!athlete) return bad('Escolha o atleta.');
    kind = 'todas'; amount = allPrice(cfg, now);
    title = `Todas as fotos: ${athlete.name} (${cfg.event_name})`;
  } else {
    photoIds = [...new Set((b.photoIds || []).map(String))];
    if (!photoIds.length) return bad('Escolha pelo menos uma foto.');
    if (photoIds.length > MAX_PHOTOS) return bad(`Escolha até ${MAX_PHOTOS} fotos por pedido (ou leve o pacote completo).`);
    const ok = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE id IN (SELECT value FROM json_each(?)) AND has_orig = 1 AND has_prev = 1 AND event_id = ?').bind(JSON.stringify(photoIds), ev.id).first();
    if (ok.n !== photoIds.length) return bad('Alguma foto não está mais disponível. Recarregue a página.');
    // O pacote completo só cobre as fotos do atleta (e as gerais, se a opção estiver ligada).
    let covered = true;
    if (athlete && Number(cfg.pack_includes_general) !== 1) {
      const t = await env.DB.prepare('SELECT COUNT(*) AS n FROM photo_athletes WHERE athlete_id = ? AND photo_id IN (SELECT value FROM json_each(?))').bind(athlete.id, JSON.stringify(photoIds)).first();
      covered = t.n === photoIds.length;
    }
    const price = cartPrice(photoIds.length, cfg, now, { allowAll: !!athlete && covered });
    if (price.kind === 'all') { kind = 'todas'; amount = price.total; photoIds = []; title = `Todas as fotos: ${athlete.name} (${cfg.event_name})`; }
    else { kind = 'fotos'; amount = price.total; title = `${photoIds.length} foto${photoIds.length > 1 ? 's' : ''} (${cfg.event_name})`; }
  }
  if (amount < 100) return bad('Valor inválido.');

  const order = { id: uid(), token: token(), created_at: new Date().toISOString() };
  const pin = await newPin(b.pin, whatsapp);
  const stmts = [env.DB.prepare(
    `INSERT INTO orders (id, token, athlete_id, buyer_name, whatsapp, email, kind, amount_cents, status, created_at, presale, pin_salt, pin_hash, pin_enc, event_id, pack_limit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aguardando', ?, 0, ?, ?, ?, ?, ?)`
  ).bind(order.id, order.token, athlete ? athlete.id : null, name, whatsapp, email, kind, amount, order.created_at, pin.salt, pin.hash, await encryptPin(env, b.pin), ev.id, kind === 'todas' ? packLimit(cfg) : 0)];
  if (photoIds.length) stmts.push(env.DB.prepare('INSERT INTO order_photos (order_id, photo_id) SELECT ?, value FROM json_each(?)').bind(order.id, JSON.stringify(photoIds)));
  await env.DB.batch(stmts);

  try {
    const pref = await createPreference(env, {
      order: { ...order, amount_cents: amount, buyer_name: name }, title, origin: new URL(request.url).origin,
    });
    return json({ token: order.token, url: pref.init_point, total: reais(amount) });
  } catch (e) {
    await env.DB.prepare("UPDATE orders SET status = 'erro' WHERE id = ?").bind(order.id).run();
    return bad(`Não consegui abrir o pagamento. ${String(e.message).slice(0, 200)}`, 502);
  }
}

// Fotos adicionais de quem já comprou um pacote com limite: { x: token do pacote, photoIds, e }.
// Vira um pedido de fotos avulsas (mesmos dados e mesma senha do pacote), cobrado por foto adicional.
async function extras(b, request, env) {
  const ev = await eventBySlug(env, b.e);
  if (!ev) return bad('Evento não encontrado.', 404);
  const cfg = await getConfig(env, ev.id);
  if (ev.archived || !salesOpen(cfg)) return bad('As vendas foram encerradas.', 410);
  const base = await getOrder(env, 'o.token', String(b.x));
  if (!base || base.event_id !== ev.id || base.kind !== 'todas' || !base.pack_limit || !PAID.includes(base.status)) return bad('Pacote não encontrado.', 404);
  const unit = packExtra(cfg);
  if (unit < 100) return bad('Fotos adicionais não estão disponíveis.');
  const photoIds = [...new Set((b.photoIds || []).map(String))];
  if (!photoIds.length) return bad('Escolha pelo menos uma foto.');
  if (photoIds.length > MAX_PHOTOS) return bad(`Escolha até ${MAX_PHOTOS} fotos por pedido.`);
  const ok = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM photos p WHERE p.id IN (SELECT value FROM json_each(?)) AND p.has_orig = 1 AND p.has_prev = 1 AND p.event_id = ?
       AND EXISTS (SELECT 1 FROM photo_athletes pa WHERE pa.photo_id = p.id AND pa.athlete_id = ?)
       AND NOT EXISTS (SELECT 1 FROM order_photos op WHERE op.photo_id = p.id AND op.order_id = ?)`
  ).bind(JSON.stringify(photoIds), ev.id, base.athlete_id, base.id).first();
  if (ok.n !== photoIds.length) return bad('Alguma foto não está disponível ou já faz parte do seu pacote. Recarregue a página.');
  const amount = photoIds.length * unit;
  const order = { id: uid(), token: token(), created_at: new Date().toISOString() };
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO orders (id, token, athlete_id, buyer_name, whatsapp, email, kind, amount_cents, status, created_at, presale, pin_salt, pin_hash, pin_enc, event_id, pack_limit)
       VALUES (?, ?, ?, ?, ?, ?, 'fotos', ?, 'aguardando', ?, 0, ?, ?, ?, ?, 0)`
    ).bind(order.id, order.token, base.athlete_id, base.buyer_name, base.whatsapp, base.email, amount, order.created_at, base.pin_salt, base.pin_hash, base.pin_enc, ev.id),
    env.DB.prepare('INSERT INTO order_photos (order_id, photo_id) SELECT ?, value FROM json_each(?)').bind(order.id, JSON.stringify(photoIds)),
  ]);
  try {
    const pref = await createPreference(env, {
      order: { ...order, amount_cents: amount, buyer_name: base.buyer_name },
      title: `${photoIds.length} foto${photoIds.length > 1 ? 's' : ''} adicional${photoIds.length > 1 ? 'is' : ''} (${cfg.event_name})`, origin: new URL(request.url).origin,
    });
    return json({ token: order.token, url: pref.init_point, total: reais(amount) });
  } catch (e) {
    await env.DB.prepare("UPDATE orders SET status = 'erro' WHERE id = ?").bind(order.id).run();
    return bad(`Não consegui abrir o pagamento. ${String(e.message).slice(0, 200)}`, 502);
  }
}
