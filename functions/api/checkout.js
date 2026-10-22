import { json, bad, readJson, uid, token } from '../_lib/util.js';
import { normWpp, validPin, newPin } from '../_lib/pin.js';
import { getConfig } from '../_lib/db.js';
import { isPresale, allPrice, cartPrice, reais } from '../_lib/pricing.js';
import { createPreference } from '../_lib/mp.js';

const MAX_PHOTOS = 90; // limite de parâmetros por consulta do D1

// { athleteId?, all?, photoIds?, name, whatsapp, email? } -> { token, url }
export async function onRequestPost({ request, env }) {
  if (!env.MP_ACCESS_TOKEN) return bad('Pagamento ainda não configurado.', 503);
  const b = await readJson(request);
  const name = String(b.name || '').trim().slice(0, 120);
  const whatsapp = normWpp(b.whatsapp);
  const email = String(b.email || '').trim().slice(0, 160);
  if (name.length < 2) return bad('Informe seu nome.');
  if (whatsapp.length < 10 || whatsapp.length > 13) return bad('Informe um WhatsApp válido com DDD.');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return bad('E-mail inválido.');
  if (!validPin(b.pin)) return bad('Crie uma senha de 4 a 6 números.');

  const cfg = await getConfig(env);
  const now = Date.now();
  let athlete = null;
  if (b.athleteId) {
    athlete = await env.DB.prepare('SELECT id, name FROM athletes WHERE id = ?').bind(Number(b.athleteId)).first();
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
    const ph = photoIds.map(() => '?').join(',');
    const { results } = await env.DB.prepare(
      `SELECT id FROM photos WHERE id IN (${ph}) AND has_orig = 1 AND has_prev = 1`).bind(...photoIds).all();
    if (results.length !== photoIds.length) return bad('Alguma foto não está mais disponível. Recarregue a página.');
    const price = cartPrice(photoIds.length, cfg, now, { allowAll: !!athlete });
    if (price.kind === 'all') { kind = 'todas'; amount = price.total; photoIds = []; title = `Todas as fotos: ${athlete.name} (${cfg.event_name})`; }
    else { kind = 'fotos'; amount = price.total; title = `${photoIds.length} foto${photoIds.length > 1 ? 's' : ''} (${cfg.event_name})`; }
  }
  if (amount < 100) return bad('Valor inválido.');

  const order = { id: uid(), token: token(), created_at: new Date().toISOString() };
  const pin = await newPin(b.pin, whatsapp);
  const stmts = [env.DB.prepare(
    `INSERT INTO orders (id, token, athlete_id, buyer_name, whatsapp, email, kind, amount_cents, status, created_at, presale, pin_salt, pin_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'aguardando', ?, 0, ?, ?)`
  ).bind(order.id, order.token, athlete ? athlete.id : null, name, whatsapp, email, kind, amount, order.created_at, pin.salt, pin.hash)];
  for (const pid of photoIds) stmts.push(env.DB.prepare('INSERT INTO order_photos (order_id, photo_id) VALUES (?, ?)').bind(order.id, pid));
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
