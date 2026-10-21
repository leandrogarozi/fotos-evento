import { json, bad, readJson, uid, token, onlyDigits } from '../_lib/util.js';
import { getConfig } from '../_lib/db.js';
import { isPresale, allPrice } from '../_lib/pricing.js';
import { createPreference } from '../_lib/mp.js';

export async function onRequestPost({ request, env }) {
  if (!env.MP_ACCESS_TOKEN) return bad('Pagamento ainda não configurado.', 503);
  const b = await readJson(request);
  const name = String(b.name || '').trim().slice(0, 120);
  const whatsapp = onlyDigits(b.whatsapp);
  const email = String(b.email || '').trim().slice(0, 160);
  if (name.length < 2) return bad('Informe seu nome.');
  if (whatsapp.length < 10 || whatsapp.length > 13) return bad('Informe um WhatsApp válido com DDD.');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) return bad('E-mail inválido.');

  const athlete = await env.DB.prepare('SELECT id, name FROM athletes WHERE id = ? AND active = 1').bind(Number(b.athleteId)).first();
  if (!athlete) return bad('Escolha o atleta na lista.');

  const cfg = await getConfig(env);
  if (!isPresale(cfg)) return bad('A pré-venda terminou.', 410);

  const order = {
    id: uid(), token: token(), athlete_id: athlete.id, buyer_name: name, whatsapp, email,
    kind: 'todas', amount_cents: allPrice(cfg), status: 'aguardando', created_at: new Date().toISOString(),
  };
  await env.DB.prepare(
    `INSERT INTO orders (id, token, athlete_id, buyer_name, whatsapp, email, kind, amount_cents, status, created_at, presale)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(order.id, order.token, order.athlete_id, order.buyer_name, order.whatsapp, order.email,
         order.kind, order.amount_cents, order.status, order.created_at).run();

  try {
    const pref = await createPreference(env, {
      order, origin: new URL(request.url).origin,
      title: `Todas as fotos — ${athlete.name} (${cfg.event_name})`,
    });
    return json({ token: order.token, url: pref.init_point });
  } catch (e) {
    await env.DB.prepare("UPDATE orders SET status = 'erro' WHERE id = ?").bind(order.id).run();
    return bad('Não consegui abrir o pagamento. Tente de novo em instantes.', 502);
  }
}
