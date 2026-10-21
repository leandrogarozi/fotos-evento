// Preços e regras do carrinho. Tudo em centavos. Funções puras (testadas em test/).

export const DEFAULTS = {
  event_name: 'Campeonato Interno de CrossFit',
  event_date: '2026-10-24',
  brand_text: 'Leandro Garozi Fotografia',
  whatsapp: '5527981447230',
  // Pré-venda até sexta 23/10 23h59 (Brasília = UTC-3)
  presale_end: '2026-10-24T02:59:59Z',
  presale_price_cents: 5000,
  price_one_cents: 1500,
  price_four_cents: 4000,
  price_all_event_cents: 6000,
  price_all_late_cents: 8000,
  // Preencher quando as fotos forem publicadas; começa a contar os dias do preço "event"
  published_at: '',
  late_after_days: 5,
  price_box_cents: 0,
};

export const NUMERIC_KEYS = [
  'presale_price_cents', 'price_one_cents', 'price_four_cents',
  'price_all_event_cents', 'price_all_late_cents', 'late_after_days', 'price_box_cents',
];

export function mergeConfig(rows) {
  const cfg = { ...DEFAULTS };
  for (const r of rows || []) {
    cfg[r.key] = NUMERIC_KEYS.includes(r.key) ? Number(r.value) : r.value;
  }
  return cfg;
}

export function isPresale(cfg, now = Date.now()) {
  return now <= Date.parse(cfg.presale_end);
}

// Preço do pacote "todas as fotos do atleta" no momento `now`.
export function allPrice(cfg, now = Date.now()) {
  if (isPresale(cfg, now)) return cfg.presale_price_cents;
  if (cfg.published_at) {
    const limit = Date.parse(cfg.published_at) + cfg.late_after_days * 86400000;
    if (now > limit) return cfg.price_all_late_cents;
  }
  return cfg.price_all_event_cents;
}

// Até quando vale o preço atual do pacote "todas" (ISO) e qual será o próximo.
export function allPriceDeadline(cfg, now = Date.now()) {
  if (isPresale(cfg, now)) return { until: cfg.presale_end, next: cfg.price_all_event_cents };
  if (cfg.published_at) {
    const limit = Date.parse(cfg.published_at) + cfg.late_after_days * 86400000;
    if (now <= limit) return { until: new Date(limit).toISOString(), next: cfg.price_all_late_cents };
  }
  return { until: null, next: null };
}

// Menor preço para n fotos de um atleta, combinando 1 foto, pacote de 4 e "todas".
export function cartPrice(n, cfg, now = Date.now()) {
  const p1 = cfg.price_one_cents, p4 = cfg.price_four_cents, pAll = allPrice(cfg, now);
  if (!n || n < 1) return { total: 0, kind: 'none', freeExtra: 0, upsell: null, allPrice: pAll };
  let best = { total: Infinity, fours: 0 };
  for (let k = 0; k <= Math.ceil(n / 4); k++) {
    const rest = Math.max(0, n - 4 * k);
    const total = k * p4 + rest * p1;
    if (total < best.total) best = { total, fours: k };
  }
  if (pAll <= best.total) {
    return { total: pAll, kind: 'all', freeExtra: 0, upsell: null, allPrice: pAll };
  }
  const covered = best.fours * 4 + Math.max(0, n - best.fours * 4);
  const freeExtra = Math.max(0, covered - n);
  const upsell = n >= 2 ? { extra: pAll - best.total, price: pAll } : null;
  return { total: best.total, kind: best.fours ? 'four' : 'unit', freeExtra, upsell, allPrice: pAll };
}

export function reais(cents) {
  return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',').replace(',00', '');
}
