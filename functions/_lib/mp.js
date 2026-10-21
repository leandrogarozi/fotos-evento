import { hmacHex, safeEqual } from './util.js';

const API = 'https://api.mercadopago.com';
const auth = (env) => ({ Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json' });

export async function createPreference(env, { order, title, origin }) {
  const res = await fetch(`${API}/checkout/preferences`, {
    method: 'POST',
    headers: auth(env),
    body: JSON.stringify({
      items: [{ id: order.id, title, quantity: 1, unit_price: order.amount_cents / 100, currency_id: 'BRL' }],
      payer: { name: order.buyer_name },
      external_reference: order.id,
      notification_url: `${origin}/api/webhook/mercadopago`,
      back_urls: ['success', 'pending', 'failure'].reduce((o, k) => ({ ...o, [k]: `${origin}/pedido.html?t=${order.token}` }), {}),
      auto_return: 'approved',
      statement_descriptor: 'FOTOS EVENTO',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Mercado Pago: ' + (data.message || res.status));
  return data;
}

export async function getPayment(env, id) {
  const res = await fetch(`${API}/v1/payments/${encodeURIComponent(id)}`, { headers: auth(env) });
  if (!res.ok) return null;
  return res.json();
}

export async function searchPayments(env, externalReference) {
  const res = await fetch(`${API}/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}`, { headers: auth(env) });
  if (!res.ok) return [];
  return (await res.json()).results || [];
}

// Pagamento só vale se aprovado e com valor >= o do pedido.
export const paymentCountsFor = (payment, order) =>
  payment && payment.status === 'approved' &&
  Math.round(Number(payment.transaction_amount) * 100) >= order.amount_cents;

// Assinatura do webhook (header x-signature: "ts=...,v1=...").
export async function verifySignature(request, dataId, secret) {
  const sig = request.headers.get('x-signature');
  if (!sig || !secret) return false;
  const parts = Object.fromEntries(sig.split(',').map((p) => { const [k, ...v] = p.trim().split('='); return [k, v.join('=')]; }));
  if (!parts.ts || !parts.v1) return false;
  const reqId = request.headers.get('x-request-id');
  let manifest = '';
  if (dataId) manifest += `id:${String(dataId).toLowerCase()};`;
  if (reqId) manifest += `request-id:${reqId};`;
  manifest += `ts:${parts.ts};`;
  return safeEqual(await hmacHex(secret, manifest), parts.v1);
}
