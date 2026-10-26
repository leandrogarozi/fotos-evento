import { json, bad, readJson, uid, token } from '../_lib/util.js';
import { normWpp, validPin, newPin } from '../_lib/pin.js';
import { encryptPin } from '../_lib/secret.js';
import { getConfig } from '../_lib/db.js';
import { eventBySlug } from '../_lib/events.js';
import { isPresale, allPrice, salesOpen, packLimit } from '../_lib/pricing.js';
import { createPreference } from '../_lib/mp.js';

export async function onRequestPost({ request, env }) {
  if (!env.MP_ACCESS_TOKEN) return bad('Pagamento ainda não configurado.', 503);
  const b = await readJson(request);
  const name = String(b.name || '').trim().slice(0, 120);
  const whatsapp = normWpp(b.whatsapp);
  const email = String(b.email || '').trim().slice(0, 160);
  if (name.length < 2) return bad('Informe seu nome.');
  if (whatsapp.length < 10 || whatsapp.length > 13) return bad('Informe um WhatsApp válido com DDD.');
  if (!/^\S+@\S+\.\S+$/.test(email)) return bad('Informe um e-mail válido: é para ele que enviamos sua senha e o link.');
  if (!validPin(b.pin)) return bad('Crie uma senha de 4 a 6 números.');

  const ev = await eventBySlug(env, b.e);
  if (!ev) return bad('Evento não encontrado.', 404);
  const athlete = await env.DB.prepare('SELECT id, name FROM athletes WHERE id = ? AND active = 1 AND event_id = ?').bind(Number(b.athleteId), ev.id).first();
  if (!athlete) return bad('Escolha o atleta na lista.');

  const cfg = await getConfig(env, ev.id);
  if (ev.archived || !salesOpen(cfg)) return bad('As vendas foram encerradas.', 410);
  if (!isPresale(cfg)) return bad('A pré-venda terminou.', 410);

  const pin = await newPin(b.pin, whatsapp);
  const order = {
    id: uid(), token: token(), athlete_id: athlete.id, buyer_name: name, whatsapp, email,
    kind: 'todas', amount_cents: allPrice(cfg), status: 'aguardando', created_at: new Date().toISOString(),
  };
  await env.DB.prepare(
    `INSERT INTO orders (id, token, athlete_id, buyer_name, whatsapp, email, kind, amount_cents, status, created_at, presale, pin_salt, pin_hash, pin_enc, event_id, pack_limit)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)`
  ).bind(order.id, order.token, order.athlete_id, order.buyer_name, order.whatsapp, order.email,
         order.kind, order.amount_cents, order.status, order.created_at, pin.salt, pin.hash, await encryptPin(env, b.pin), ev.id, packLimit(cfg, Date.now())).run();

  try {
    const pref = await createPreference(env, {
      order, origin: new URL(request.url).origin, onlyPix: Number(cfg.mp_exclude_cards) === 1,
      title: `Todas as fotos: ${athlete.name} (${cfg.event_name})`,
    });
    return json({ token: order.token, url: pref.init_point });
  } catch (e) {
    await env.DB.prepare("UPDATE orders SET status = 'erro' WHERE id = ?").bind(order.id).run();
    return bad(`Não consegui abrir o pagamento. ${String(e.message).slice(0, 200)}`, 502);
  }
}
