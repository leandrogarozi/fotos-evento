import { hmacHex, safeEqual } from './util.js';

export const PAID = ['pago', 'liberado'];
const secret = (env) => env.DOWNLOAD_SECRET || env.ADMIN_PASSWORD || '';
const READY = 'p.has_orig = 1 AND p.has_prev = 1';

// Fotos que o pedido libera. No pacote "todas" vale tudo do atleta, inclusive fotos
// enviadas depois da compra (é isso que libera a pré-venda sozinha).
export async function orderPhotos(env, order) {
  if (!PAID.includes(order.status)) return [];
  const q = order.kind === 'todas'
    ? [`SELECT p.id, p.filename FROM photos p WHERE ${READY} AND (
          EXISTS (SELECT 1 FROM photo_athletes pa WHERE pa.photo_id = p.id AND pa.athlete_id = ?)
          OR EXISTS (SELECT 1 FROM order_photos op WHERE op.photo_id = p.id AND op.order_id = ?))
        ORDER BY p.filename`, [order.athlete_id, order.id]]
    : [`SELECT p.id, p.filename FROM photos p JOIN order_photos op ON op.photo_id = p.id
        WHERE op.order_id = ? AND ${READY} ORDER BY p.filename`, [order.id]];
  const { results } = await env.DB.prepare(q[0]).bind(...q[1]).all();
  return results;
}

export async function photoAllowed(env, order, photoId) {
  const list = await orderPhotos(env, order);
  return list.find((p) => p.id === photoId) || null;
}

// Uma assinatura por pedido + validade; cada download ainda confere se a foto é do pedido.
export async function dlSignature(env, order, exp) {
  return hmacHex(secret(env), `dl.${order.token}.${exp}`);
}

export async function dlQuery(env, order, days = 7) {
  const exp = Date.now() + days * 86400000;
  return `t=${order.token}&e=${exp}&s=${await dlSignature(env, order, exp)}`;
}

export async function dlValid(env, order, exp, sig) {
  if (!order || !exp || Number(exp) < Date.now()) return false;
  return safeEqual(await dlSignature(env, order, exp), sig || '');
}
