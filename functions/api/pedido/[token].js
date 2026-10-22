import { json, bad } from '../../_lib/util.js';
import { getOrder, getConfig } from '../../_lib/db.js';
import { extraUnit } from '../../_lib/pricing.js';
import { syncOrder } from '../../_lib/sync.js';
import { orderPhotos, dlQuery, taggedCount } from '../../_lib/access.js';

const PAID_OK = ['pago', 'liberado'];

export async function onRequestGet({ params, request, env }) {
  let order = await getOrder(env, 'o.token', params.token);
  if (!order) return bad('Pedido não encontrado.', 404);
  if (new URL(request.url).searchParams.get('sync')) order = await syncOrder(env, order, new URL(request.url).origin);
  const list = await orderPhotos(env, order);
  const q = list.length ? await dlQuery(env, order) : '';
  const cfg = await getConfig(env, order.event_id);
  let claimed = [], galleryCount = 0;
  if (order.kind === 'todas' && ['pago', 'liberado'].includes(order.status)) {
    claimed = (await env.DB.prepare('SELECT photo_id FROM order_photos WHERE order_id = ?').bind(order.id).all()).results.map((r) => r.photo_id);
    galleryCount = (await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE has_orig = 1 AND has_prev = 1 AND event_id = ?').bind(order.event_id).first()).n;
  }
  // Pacote com limite: quando o atleta tem mais fotos que o limite, o comprador escolhe quais leva.
  let pick = null;
  if (order.kind === 'todas' && order.pack_limit > 0 && PAID_OK.includes(order.status)) {
    const total = await taggedCount(env, order);
    if (total > order.pack_limit) {
      const chosen = (await env.DB.prepare('SELECT COUNT(*) AS n FROM order_photos WHERE order_id = ?').bind(order.id).first()).n;
      pick = { limit: order.pack_limit, total, chosen, extra: extraUnit(cfg) };
      if (!chosen) {
        const { results } = await env.DB.prepare(
          `SELECT p.id, p.filename FROM photos p WHERE p.has_orig = 1 AND p.has_prev = 1 AND p.event_id = ? AND EXISTS (SELECT 1 FROM photo_athletes pa WHERE pa.photo_id = p.id AND pa.athlete_id = ?) ORDER BY p.filename`
        ).bind(order.event_id, order.athlete_id).all();
        pick.options = results.map((p) => ({ id: p.id, name: p.filename, thumb: `/img/${p.id}` }));
      }
    }
  }
  return json({
    pick, athleteId: order.athlete_id, packLimit: order.pack_limit || 0,
    claimed, galleryCount, claimEnabled: Number(cfg.claim_enabled) === 1 && !(order.pack_limit > 0), claimMax: Math.max(0, Number(cfg.claim_max) || 0),
    eventSlug: order.event_slug, eventName: order.event_name,
    status: order.status,
    kind: order.kind,
    athlete: order.athlete_name,
    buyer: order.buyer_name,
    amount: order.amount_cents,
    presale: !!order.presale,
    photos: list.map((p) => ({ id: p.id, name: p.filename, thumb: `/img/${p.id}`, url: `/api/dl/${p.id}?${q}` })),
  });
}
