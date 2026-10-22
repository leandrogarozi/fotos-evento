import { json } from '../_lib/util.js';
import { getConfig } from '../_lib/db.js';
import { isPresale, allPrice, allPriceDeadline } from '../_lib/pricing.js';

export async function onRequestGet({ env }) {
  const cfg = await getConfig(env);
  const { results } = await env.DB.prepare(
    'SELECT id, name, turma, turma_order FROM athletes WHERE active = 1 ORDER BY turma_order'
  ).all();
  const byName = (a, b) => a.turma_order - b.turma_order || a.name.localeCompare(b.name, 'pt-BR');
  const now = Date.now();
  return json({
    eventName: cfg.event_name,
    eventDate: cfg.event_date,
    whatsapp: cfg.whatsapp,
    brandText: cfg.brand_text,
    claimMax: Math.min(90, Number(cfg.claim_max) || 40),
    prices: { one: cfg.price_one_cents, four: cfg.price_four_cents },
    presale: isPresale(cfg, now),
    presaleEnd: cfg.presale_end,
    allPrice: allPrice(cfg, now),
    deadline: allPriceDeadline(cfg, now),
    athletes: results.sort(byName).map(({ id, name, turma }) => ({ id, name, turma })),
  });
}
