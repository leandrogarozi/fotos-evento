import { json, bad, readJson } from '../_lib/util.js';
import { getConfig, getOrder } from '../_lib/db.js';
import { PAID } from '../_lib/access.js';

const HARD_MAX = 90; // limite de parâmetros por consulta do D1

// Quem comprou o pacote completo marca, na galeria geral, as fotos em que aparece.
// { token, photoIds } substitui a seleção anterior do pedido.
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const order = await getOrder(env, 'o.token', String(b.token || ''));
  if (!order || !PAID.includes(order.status)) return bad('Pedido não encontrado ou ainda não pago.', 403);
  if (order.kind !== 'todas') return bad('Este pedido não permite marcar fotos.', 403);
  const cfg = await getConfig(env);
  const max = Math.min(HARD_MAX, Math.max(1, Number(cfg.claim_max) || 40));
  const ids = [...new Set((b.photoIds || []).map(String))];
  if (ids.length > max) return bad(`Você pode marcar até ${max} fotos. Se precisar de mais, fale comigo no WhatsApp.`);
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const { results } = await env.DB.prepare(`SELECT id FROM photos WHERE id IN (${ph}) AND has_orig = 1 AND has_prev = 1`).bind(...ids).all();
    if (results.length !== ids.length) return bad('Alguma foto não está mais disponível. Recarregue a página.');
  }
  await env.DB.batch([
    env.DB.prepare('DELETE FROM order_photos WHERE order_id = ?').bind(order.id),
    ...ids.map((id) => env.DB.prepare('INSERT INTO order_photos (order_id, photo_id) VALUES (?, ?)').bind(order.id, id)),
  ]);
  return json({ ok: true, count: ids.length });
}
