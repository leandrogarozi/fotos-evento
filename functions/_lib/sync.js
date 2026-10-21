import { searchPayments, paymentCountsFor } from './mp.js';
import { markPaid, getOrder } from './db.js';

// Rede de segurança: se o webhook não chegou, pergunta ao Mercado Pago pelo pedido.
export async function syncOrder(env, order) {
  if (!order || order.status !== 'aguardando' || !env.MP_ACCESS_TOKEN) return order;
  const payments = await searchPayments(env, order.id);
  const ok = payments.find((p) => paymentCountsFor(p, order));
  if (ok) {
    await markPaid(env, order.id, ok.id);
    return getOrder(env, 'o.id', order.id);
  }
  return order;
}
