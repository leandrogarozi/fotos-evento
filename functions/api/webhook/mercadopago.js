import { json, readJson } from '../../_lib/util.js';
import { getPayment, paymentCountsFor, verifySignature } from '../../_lib/mp.js';
import { getOrder, markPaid } from '../../_lib/db.js';

// O Mercado Pago só avisa "tem novidade no pagamento X". Quem decide é a API dele:
// consultamos o pagamento com nosso token e só liberamos se estiver approved.
export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  const body = await readJson(request);
  const type = url.searchParams.get('type') || url.searchParams.get('topic') || body.type || body.topic;
  const dataId = url.searchParams.get('data.id') || url.searchParams.get('id') || (body.data && body.data.id);
  if (!dataId || (type && type !== 'payment')) return json({ ok: true });

  if (env.MP_WEBHOOK_STRICT === '1' && !(await verifySignature(request, dataId, env.MP_WEBHOOK_SECRET))) {
    return json({ error: 'assinatura inválida' }, 401);
  }

  const payment = await getPayment(env, dataId);
  if (!payment || !payment.external_reference) return json({ ok: true });
  const order = await getOrder(env, 'o.id', payment.external_reference);
  if (order && paymentCountsFor(payment, order)) await markPaid(env, order.id, payment.id);
  return json({ ok: true });
}
