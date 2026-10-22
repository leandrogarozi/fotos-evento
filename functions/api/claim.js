import { json, bad, readJson } from '../_lib/util.js';
import { getConfig, getOrder } from '../_lib/db.js';
import { PAID } from '../_lib/access.js';

const TECH_MAX = 2000;

// Quem comprou o pacote completo marca, na galeria geral, as fotos em que aparece.
// { token, photoIds } substitui a seleção anterior. Limite opcional: config claim_max (0 = sem limite).
export async function onRequestPost({ request, env }) {
  const b = await readJson(request);
  const order = await getOrder(env, 'o.token', String(b.token || ''));
  if (!order || !PAID.includes(order.status)) return bad('Pedido não encontrado ou ainda não pago.', 403);
  if (order.kind !== 'todas') return bad('Este pedido não permite marcar fotos.', 403);
  const cfg = await getConfig(env);
  const max = Number(cfg.claim_max) > 0 ? Number(cfg.claim_max) : Infinity;
  const ids = [...new Set((b.photoIds || []).map(String))];
  if (ids.length > Math.min(max, TECH_MAX)) return bad(`Você pode marcar até ${Math.min(max, TECH_MAX)} fotos. Se precisar de mais, fale comigo no WhatsApp.`);
  const js = JSON.stringify(ids);
  if (ids.length) {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE id IN (SELECT value FROM json_each(?)) AND has_orig = 1 AND has_prev = 1').bind(js).first();
    if (r.n !== ids.length) return bad('Alguma foto não está mais disponível. Recarregue a página.');
  }
  const stmts = [env.DB.prepare('DELETE FROM order_photos WHERE order_id = ?').bind(order.id)];
  if (ids.length) stmts.push(env.DB.prepare('INSERT INTO order_photos (order_id, photo_id) SELECT ?, value FROM json_each(?)').bind(order.id, js));
  await env.DB.batch(stmts);
  return json({ ok: true, count: ids.length });
}
