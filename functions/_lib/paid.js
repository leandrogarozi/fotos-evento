import { getOrder } from './db.js';
import { decryptPin } from './secret.js';
import { sendAccessEmail } from './mail.js';

// Marca como pago (uma vez só) e, na primeira vez, manda o e-mail com a senha e o link.
export async function markPaid(env, orderId, paymentId, origin) {
  const r = await env.DB.prepare(
    `UPDATE orders SET status = 'pago', mp_payment_id = ?, paid_at = COALESCE(paid_at, ?)
     WHERE id = ? AND status = 'aguardando'`
  ).bind(String(paymentId), new Date().toISOString(), orderId).run();
  if (r && r.meta && r.meta.changes > 0) await notifyPaid(env, orderId, origin);
}

export async function notifyPaid(env, orderId, origin) {
  try {
    const order = await getOrder(env, 'o.id', orderId);
    if (!order || !order.email || !order.pin_enc || !env.MAIL_WEBHOOK_URL) return false;
    const pin = await decryptPin(env, order.pin_enc);
    if (!pin) return false;
    const ok = await sendAccessEmail(env, { order, pin, origin });
    if (ok) await env.DB.prepare("UPDATE orders SET pin_enc = '' WHERE id = ?").bind(orderId).run();
    return ok;
  } catch (e) { console.error('notifyPaid', e && e.message); return false; }
}
