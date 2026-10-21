import { json, bad, readJson } from '../../_lib/util.js';
import { isAdmin, denied } from '../../_lib/auth.js';
import { syncOrder } from '../../_lib/sync.js';
import { getOrder } from '../../_lib/db.js';

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const { results } = await env.DB.prepare(
    `SELECT o.id, o.token, o.buyer_name, o.whatsapp, o.email, o.kind, o.amount_cents, o.status, o.presale,
            o.created_at, o.paid_at, o.manual, a.name AS athlete_name
     FROM orders o LEFT JOIN athletes a ON a.id = o.athlete_id
     WHERE o.status != 'erro' ORDER BY o.created_at DESC`
  ).all();
  const total = results.filter((o) => o.status === 'pago' || o.status === 'liberado')
    .reduce((s, o) => s + o.amount_cents, 0);
  return json({ orders: results, totalCents: total });
}

// { id, action: 'liberar' | 'verificar' }
export async function onRequestPost({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const { id, action } = await readJson(request);
  const order = await getOrder(env, 'o.id', id);
  if (!order) return bad('Pedido não encontrado.', 404);
  if (action === 'verificar') {
    const o = await syncOrder(env, order);
    return json({ status: o.status });
  }
  if (action === 'liberar') {
    await env.DB.prepare(
      `UPDATE orders SET status = 'pago', manual = 1, paid_at = COALESCE(paid_at, ?) WHERE id = ?`
    ).bind(new Date().toISOString(), id).run();
    return json({ status: 'pago' });
  }
  return bad('Ação inválida.');
}
