import { json, bad } from '../_lib/util.js';
import { getConfig } from '../_lib/db.js';
import { eventBySlug, slugParam } from '../_lib/events.js';
import { DEFAULTS, parseTiers, isPresale, allPrice, allPriceDeadline, packLimit, packExtra, salesCloseAt, salesOpen } from '../_lib/pricing.js';

export async function onRequestGet({ request, env }) {
  const ev = await eventBySlug(env, slugParam(request));
  if (!ev) return bad('Evento não encontrado.', 404);
  const cfg = await getConfig(env, ev.id);
  const { results } = await env.DB.prepare(
    'SELECT id, name, turma, turma_order FROM athletes WHERE active = 1 AND event_id = ? ORDER BY turma_order'
  ).bind(ev.id).all();
  const byName = (a, b) => a.turma_order - b.turma_order || a.name.localeCompare(b.name, 'pt-BR');
  const now = Date.now();
  return json({
    slug: ev.slug,
    isMain: !!ev.is_main,
    eventName: cfg.event_name,
    eventDate: cfg.event_date,
    whatsapp: cfg.whatsapp,
    brandText: cfg.brand_text,
    texts: Object.fromEntries(Object.keys(DEFAULTS).filter((k) => k.startsWith('txt_')).map((k) => [k, cfg[k] || DEFAULTS[k]])),
    claimEnabled: Number(cfg.claim_enabled) === 1,
    claimMax: Math.max(0, Number(cfg.claim_max) || 0),
    tiers: parseTiers(cfg),
    prices: { one: (parseTiers(cfg).find((t) => t.n === 1) || {}).cents || null, four: (parseTiers(cfg).find((t) => t.n === 4) || {}).cents || null },
    presale: isPresale(cfg, now),
    salesEnd: salesCloseAt(cfg) ? new Date(salesCloseAt(cfg)).toISOString() : null,
    salesClosed: !salesOpen(cfg, now) || !!ev.archived,
    presaleEnd: cfg.presale_end,
    allPrice: allPrice(cfg, now),
    packLimit: packLimit(cfg),
    packExtra: packExtra(cfg),
    deadline: allPriceDeadline(cfg, now),
    athletes: results.sort(byName).map(({ id, name, turma }) => ({ id, name, turma })),
  });
}
