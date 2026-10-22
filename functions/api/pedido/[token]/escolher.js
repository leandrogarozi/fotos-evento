import { json, bad, readJson } from '../../../_lib/util.js';
import { getOrder } from '../../../_lib/db.js';
import { PAID, taggedCount } from '../../../_lib/access.js';

// Quem comprou um pacote com limite escolhe aqui as fotos que leva (uma única vez).
export async function onRequestPost({ params, request, env }) {
  const order = await getOrder(env, 'o.token', params.token);
  if (!order) return bad('Pedido não encontrado.', 404);
  if (order.kind !== 'todas' || !(order.pack_limit > 0) || !PAID.includes(order.status)) return bad('Este pedido não tem fotos para escolher.');
  const b = await readJson(request);
  const ids = [...new Set((b.photoIds || []).map(String))];
  if (!ids.length) return bad('Escolha pelo menos uma foto.');
  if (ids.length > order.pack_limit) return bad(`Seu pacote vale até ${order.pack_limit} fotos.`);
  if ((await taggedCount(env, order)) <= order.pack_limit) return bad('Todas as suas fotos já estão liberadas.');
  const ok = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM photos p WHERE p.id IN (SELECT value FROM json_each(?)) AND p.has_orig = 1 AND p.has_prev = 1 AND p.event_id = ?
       AND EXISTS (SELECT 1 FROM photo_athletes pa WHERE pa.photo_id = p.id AND pa.athlete_id = ?)`
  ).bind(JSON.stringify(ids), order.event_id, order.athlete_id).first();
  if (ok.n !== ids.length) return bad('Alguma foto não está disponível. Recarregue a página.');
  // Só grava se ainda não houver escolha: a escolha vale uma vez.
  const r = await env.DB.prepare(
    'INSERT INTO order_photos (order_id, photo_id) SELECT ?, value FROM json_each(?) WHERE NOT EXISTS (SELECT 1 FROM order_photos WHERE order_id = ?)'
  ).bind(order.id, JSON.stringify(ids), order.id).run();
  if (!r.meta || !r.meta.changes) return bad('Você já escolheu as fotos deste pacote.', 409);
  return json({ ok: true, chosen: ids.length });
}
