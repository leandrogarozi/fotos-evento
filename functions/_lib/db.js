import { mergeConfig } from './pricing.js';

export async function getConfig(env) {
  const { results } = await env.DB.prepare('SELECT key, value FROM config').all();
  return mergeConfig(results);
}

export async function getOrder(env, where, value) {
  return env.DB.prepare(
    `SELECT o.*, a.name AS athlete_name FROM orders o
     LEFT JOIN athletes a ON a.id = o.athlete_id WHERE ${where} = ?`
  ).bind(value).first();
}

export async function markPaid(env, orderId, paymentId) {
  await env.DB.prepare(
    `UPDATE orders SET status = 'pago', mp_payment_id = ?, paid_at = COALESCE(paid_at, ?)
     WHERE id = ? AND status = 'aguardando'`
  ).bind(String(paymentId), new Date().toISOString(), orderId).run();
}
