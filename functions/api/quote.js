import { json } from '../_lib/util.js';
import { getConfig } from '../_lib/db.js';
import { eventBySlug, slugParam } from '../_lib/events.js';
import { cartPrice, packExtra } from '../_lib/pricing.js';

// Preço do carrinho calculado no servidor (a tela só mostra).
export async function onRequestGet({ request, env }) {
  const q = new URL(request.url).searchParams;
  const ev = await eventBySlug(env, slugParam(request));
  const cfg = await getConfig(env, ev ? ev.id : 1);
  if (Number(q.get('x')) === 1) { const n = Math.max(0, Math.floor(Number(q.get('n')) || 0)); return json({ total: n * packExtra(cfg), kind: 'cart', extra: true, freeExtra: 0, upsell: null }); }
  return json(cartPrice(Math.max(0, Math.floor(Number(q.get('n')) || 0)), cfg, Date.now(), { allowAll: !!Number(q.get('athlete')) && (!Number(q.get('g')) || Number(cfg.pack_includes_general) === 1) }));
}
