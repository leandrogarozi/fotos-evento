import { hmacHex, safeEqual } from './util.js';

const API = 'https://api.mercadopago.com';
const auth = (env) => ({ Authorization: `Bearer ${env.MP_ACCESS_TOKEN}`, 'content-type': 'application/json' });

// Dados completos do comprador (nome, sobrenome, e-mail, telefone) ajudam o antifraude do Mercado Pago a aprovar.
function payerOf(order) {
  const parts = String(order.buyer_name || '').trim().split(/\s+/), p = { name: parts[0] || '' };
  if (parts.length > 1) p.surname = parts.slice(1).join(' ');
  if (/^\S+@\S+\.\S+$/.test(order.email || '')) p.email = order.email;
  let w = String(order.whatsapp || '').replace(/\D/g, ''); if (w.length > 11 && w.startsWith('55')) w = w.slice(2);
  if (w.length === 10 || w.length === 11) p.phone = { area_code: w.slice(0, 2), number: w.slice(2) };
  return p;
}

export async function createPreference(env, { order, title, origin, onlyPix }) {
  const base = {
    items: [{ id: order.id, title, description: title, quantity: 1, unit_price: order.amount_cents / 100, currency_id: 'BRL' }],
    external_reference: order.id,
    notification_url: `${origin}/api/webhook/mercadopago`,
    back_urls: ['success', 'pending', 'failure'].reduce((o, k) => ({ ...o, [k]: `${origin}/pedido.html?t=${order.token}` }), {}),
    auto_return: 'approved',
    statement_descriptor: 'FOTOS EVENTO',
    ...(onlyPix ? { payment_methods: { excluded_payment_types: [{ id: 'credit_card' }, { id: 'debit_card' }, { id: 'ticket' }] } } : {}),
  };
  const send = (payer) => fetch(`${API}/checkout/preferences`, { method: 'POST', headers: auth(env), body: JSON.stringify({ ...base, payer }) });
  let res = await send(payerOf(order));
  if (res.status === 400) res = await send({ name: order.buyer_name }); // se o Mercado Pago recusar algum dado extra, tenta só com o nome
  const data = await res.json();
  if (!res.ok) {
    const cause = Array.isArray(data.cause) && data.cause[0] ? ' / ' + (data.cause[0].description || data.cause[0].code) : '';
    throw new Error('Mercado Pago ' + res.status + ': ' + (data.message || data.error || 'sem detalhe') + cause);
  }
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
