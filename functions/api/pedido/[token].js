import { json, bad } from '../../_lib/util.js';
import { getOrder } from '../../_lib/db.js';
import { syncOrder } from '../../_lib/sync.js';

export async function onRequestGet({ params, request, env }) {
  let order = await getOrder(env, 'o.token', params.token);
  if (!order) return bad('Pedido não encontrado.', 404);
  if (new URL(request.url).searchParams.get('sync')) order = await syncOrder(env, order);
  return json({
    status: order.status,
    athlete: order.athlete_name,
    buyer: order.buyer_name,
    amount: order.amount_cents,
    presale: !!order.presale,
    // Fase 2: aqui entram os links de download quando houver fotos do atleta.
    photos: [],
  });
}
