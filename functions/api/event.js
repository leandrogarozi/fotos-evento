import { json } from '../_lib/util.js';
import { getConfig } from '../_lib/db.js';
import { isPresale, allPrice, allPriceDeadline } from '../_lib/pricing.js';

export async function onRequestGet({ env }) {
  const cfg = await getConfig(env);
  const { results } = await env.DB.prepare(
    'SELECT id, name, turma FROM athletes WHERE active = 1 ORDER BY turma_order, name COLLATE NOCASE'
  ).all();
  const now = Date.now();
  return json({
    eventName: cfg.event_name,
    eventDate: cfg.event_date,
    whatsapp: cfg.whatsapp,
    presale: isPresale(cfg, now),
    presaleEnd: cfg.presale_end,
    allPrice: allPrice(cfg, now),
    deadline: allPriceDeadline(cfg, now),
    athletes: results,
  });
}
