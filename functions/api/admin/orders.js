import { json, bad, readJson } from '../../_lib/util.js';
import { isAdmin, denied } from '../../_lib/auth.js';
import { syncOrder } from '../../_lib/sync.js';
import { notifyPaid } from '../../_lib/paid.js';
import { sendAccessEmail } from '../../_lib/mail.js';
import { getOrder } from '../../_lib/db.js';
import { normWpp, validPin, newPin } from '../../_lib/pin.js';

export async function onRequestGet({ request, env }) {
  if (!(await isAdmin(request, env))) return denied();
  const { results } = await env.DB.prepare(
    `SELECT o.id, o.token, o.buyer_name, o.whatsapp, o.email, o.kind, o.amount_cents, o.status, o.presale,
            o.created_at, o.paid_at, o.manual, a.name AS athlete_name,
            (SELECT COUNT(*) FROM order_photos op WHERE op.order_id = o.id) AS n_photos
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
  const { id, action, pin, athleteId } = await readJson(request);
  const order = await getOrder(env, 'o.id', id);
  if (!order) return bad('Pedido não encontrado.', 404);
  if (action === 'verificar') {
    const o = await syncOrder(env, order, new URL(request.url).origin);
    return json({ status: o.status });
  }
  if (action === 'liberar') {
    await env.DB.prepare(
      `UPDATE orders SET status = 'pago', manual = 1, paid_at = COALESCE(paid_at, ?) WHERE id = ?`
    ).bind(new Date().toISOString(), id).run();
    if (order.status === 'aguardando') await notifyPaid(env, id, new URL(request.url).origin);
    return json({ status: 'pago' });
  }
  if (action === 'excluir') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM order_photos WHERE order_id = ?').bind(id),
      env.DB.prepare('DELETE FROM orders WHERE id = ?').bind(id),
    ]);
    return json({ ok: true });
  }
  if (action === 'atleta') {
    const a = await env.DB.prepare('SELECT id FROM athletes WHERE id = ?').bind(Number(athleteId)).first();
    if (!a) return bad('Atleta não encontrado.');
    await env.DB.prepare('UPDATE orders SET athlete_id = ? WHERE id = ?').bind(a.id, id).run();
    return json({ ok: true });
  }
  if (action === 'senha') {
    if (!validPin(pin)) return bad('A senha tem de 4 a 6 números.');
    const w = normWpp(order.whatsapp), p = await newPin(pin, w);
    await env.DB.prepare("UPDATE orders SET whatsapp = ?, pin_salt = ?, pin_hash = ?, pin_enc = '' WHERE id = ?").bind(w, p.salt, p.hash, id).run();
    const emailed = ['pago', 'liberado'].includes(order.status) && await sendAccessEmail(env, { order: { ...order, whatsapp: w }, pin, origin: new URL(request.url).origin });
    return json({ ok: true, emailed });
  }
  return bad('Ação inválida.');
}
