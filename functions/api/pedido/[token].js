import { json, bad } from '../../_lib/util.js';
import { getOrder, getConfig } from '../../_lib/db.js';
import { syncOrder } from '../../_lib/sync.js';
import { orderPhotos, dlQuery } from '../../_lib/access.js';

export async function onRequestGet({ params, request, env }) {
  let order = await getOrder(env, 'o.token', params.token);
  if (!order) return bad('Pedido não encontrado.', 404);
  if (new URL(request.url).searchParams.get('sync')) order = await syncOrder(env, order, new URL(request.url).origin);
  const list = await orderPhotos(env, order);
  const q = list.length ? await dlQuery(env, order) : '';
  let claimed = [], galleryCount = 0;
  if (order.kind === 'todas' && ['pago', 'liberado'].includes(order.status)) {
    claimed = (await env.DB.prepare('SELECT photo_id FROM order_photos WHERE order_id = ?').bind(order.id).all()).results.map((r) => r.photo_id);
    galleryCount = (await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE has_orig = 1 AND has_prev = 1').first()).n;
  }
  return json({
    claimed, galleryCount, claimMax: Math.min(90, Number((await getConfig(env)).claim_max) || 40),
    status: order.status,
    kind: order.kind,
    athlete: order.athlete_name,
    buyer: order.buyer_name,
    amount: order.amount_cents,
    presale: !!order.presale,
    photos: list.map((p) => ({ id: p.id, name: p.filename, thumb: `/img/${p.id}`, url: `/api/dl/${p.id}?${q}` })),
  });
}
