import { json, bad } from '../../_lib/util.js';
import { getOrder } from '../../_lib/db.js';
import { syncOrder } from '../../_lib/sync.js';
import { orderPhotos, dlQuery } from '../../_lib/access.js';

export async function onRequestGet({ params, request, env }) {
  let order = await getOrder(env, 'o.token', params.token);
  if (!order) return bad('Pedido não encontrado.', 404);
  if (new URL(request.url).searchParams.get('sync')) order = await syncOrder(env, order, new URL(request.url).origin);
  const list = await orderPhotos(env, order);
  const q = list.length ? await dlQuery(env, order) : '';
  return json({
    status: order.status,
    kind: order.kind,
    athlete: order.athlete_name,
    buyer: order.buyer_name,
    amount: order.amount_cents,
    presale: !!order.presale,
    photos: list.map((p) => ({ id: p.id, name: p.filename, thumb: `/img/${p.id}`, url: `/api/dl/${p.id}?${q}` })),
  });
}
