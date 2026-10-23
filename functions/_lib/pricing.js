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
  // Pacotes de fotos avulsas (JSON: [{n, cents}]). Vazio = usa price_one_cents e price_four_cents.
  price_tiers: '',
  price_all_event_cents: 6000,
  price_all_late_cents: 8000,
  // Preencher quando as fotos forem publicadas; começa a contar os dias do preço "event"
  published_at: '',
  late_after_days: 5,
  price_box_cents: 0,
  // Máx. de fotos que quem comprou o pacote completo pode marcar na galeria geral (0 = sem limite).
  claim_max: 0, // 0 = sem limite
  // 1 = quem comprou o pacote pode marcar fotos suas na galeria geral (risco: marcar foto de outros). Padrão: desligado.
  claim_enabled: 0,
  // 1 = o pacote completo também inclui as fotos gerais (torcida, ambiente). Padrão: só as fotos do atleta.
  pack_includes_general: 0,
  // Pacote com limite: vale até pack_limit fotos (0 = todas, sem limite); cada foto além disso custa pack_extra_cents.
  pack_limit: 0, // depois da pré-venda
  pack_extra_cents: 0,
  presale_limit: 0, // na pré-venda
  presale_extra_cents: 0,
  // Busca por rosto (selfie): 1 = aparece na loja. face_dist: distância máxima (50 = 0,50); menor = mais rígido.
  face_enabled: 0,
  face_dist: 50,
  // Encerramento das vendas: data fixa (sales_end) ou N dias depois de published_at (sales_days).
  sales_end: '',
  sales_days: 0,
  // Textos das páginas (editáveis no painel). *asterisco* destaca: verde nos títulos, negrito nos textos. {nome} = nome do atleta.
  txt_presale_title: 'Garanta *suas fotos*',
  txt_presale_lead: "Pré-venda: todas as suas fotos do campeonato, em alta qualidade e sem marca d'água, por um preço especial. Quando eu publicar, o download libera sozinho nesta mesma página.",
  txt_presale_after_title: 'Depois da pré-venda',
  txt_presale_after_note: 'Veja como as fotos serão cobradas depois da pré-venda e garanta agora o *menor preço* do pacote completo.',
  txt_store_title: 'Encontre *suas fotos*',
  txt_store_lead: "Escolha seu nome, veja as fotos do campeonato e leve as suas em alta qualidade, sem marca d'água.",
  txt_gallery_title: 'Todas as *fotos*',
  txt_gallery_title_athlete: 'Fotos de *{nome}*',
  txt_gallery_lead: 'Toque na foto para ampliar e no coração para escolher.',
  txt_claim_title: 'Encontre *suas fotos*',
  txt_claim_lead: 'Toque no coração das fotos em que *você aparece*. Marque quantas quiser. Depois toque em *Salvar minhas fotos*.',
  txt_closed_title: 'Vendas *encerradas*',
  txt_closed_lead: 'O prazo para comprar fotos terminou. Se você já comprou, acesse as suas fotos pelo botão abaixo.',
};

export const NUMERIC_KEYS = [
  'presale_price_cents', 'price_one_cents', 'price_four_cents',
  'price_all_event_cents', 'price_all_late_cents', 'late_after_days', 'price_box_cents', 'claim_max', 'claim_enabled', 'pack_includes_general', 'sales_days', 'pack_limit', 'pack_extra_cents', 'presale_limit', 'presale_extra_cents', 'face_enabled', 'face_dist',
];

export function mergeConfig(rows) {
  const cfg = { ...DEFAULTS };
  for (const r of rows || []) {
    cfg[r.key] = NUMERIC_KEYS.includes(r.key) ? Number(r.value) : r.value;
  }
  return cfg;
}

// Momento (ms) em que as vendas encerram, ou null se não há encerramento definido.
export function salesCloseAt(cfg) {
  if (cfg.sales_end) { const t = Date.parse(cfg.sales_end); if (t) return t; }
  if (cfg.published_at && Number(cfg.sales_days) > 0) { const t = Date.parse(cfg.published_at); if (t) return t + Number(cfg.sales_days) * 86400000; }
  return null;
}
export const salesOpen = (cfg, now = Date.now()) => { const c = salesCloseAt(cfg); return c == null || now <= c; };

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

// Pacote com limite: cada fase (pré-venda e depois) tem o seu limite e o seu preço da foto adicional.
// Só liga se o limite for > 0 e a foto adicional custar pelo menos R$ 1,00.
export const packPhase = (cfg, presale) => {
  const l = Number(presale ? cfg.presale_limit : cfg.pack_limit), x = Math.max(0, Math.round(Number(presale ? cfg.presale_extra_cents : cfg.pack_extra_cents) || 0));
  return l > 0 && x >= 100 ? { limit: Math.floor(l), extra: x } : { limit: 0, extra: 0 };
};
export const packLimit = (cfg, now = Date.now()) => packPhase(cfg, isPresale(cfg, now)).limit;
export const packExtra = (cfg, now = Date.now()) => packPhase(cfg, isPresale(cfg, now)).extra;
// Preço da foto adicional de quem já tem um pacote: o da fase atual, ou o da outra se a atual não tiver.
export const extraUnit = (cfg, now = Date.now()) => packExtra(cfg, now) || packPhase(cfg, true).extra || packPhase(cfg, false).extra;
// Preço do pacote com limite para n fotos: pacote + fotos adicionais.
export const packTotal = (n, cfg, now = Date.now()) => allPrice(cfg, now) + Math.max(0, n - packLimit(cfg, now)) * packExtra(cfg, now);

// Menor preço para n fotos de um atleta, combinando os pacotes avulsos configurados e o pacote "todas".
// opts.allowAll=false: galeria geral (sem atleta), onde não existe pacote "todas".
export function cartPrice(n, cfg, now = Date.now(), opts = {}) {
  const allowAll = opts.allowAll !== false;
  const pAll = allPrice(cfg, now);
  if (!n || n < 1) return { total: 0, kind: 'none', freeExtra: 0, upsell: null, allPrice: pAll };
  const tiers = parseTiers(cfg);
  const cost = [0], cov = [0]; // custo mínimo para cobrir pelo menos j fotos, e quantas fotos esse custo realmente cobre
  for (let j = 1; j <= n; j++) {
    let bc = Infinity, bv = 0;
    for (const t of tiers) {
      const prev = Math.max(0, j - t.n), c = cost[prev] + t.cents, v = cov[prev] + t.n;
      if (c < bc || (c === bc && v > bv)) { bc = c; bv = v; }
    }
    cost[j] = bc; cov[j] = bv;
  }
  const total = cost[n];
  const lim = packLimit(cfg, now);
  if (allowAll && lim) {
    // Com limite não existe "todas": o pacote cobre até `lim` fotos escolhidas e o resto sai por foto adicional.
    const pk = packTotal(n, cfg, now);
    if (pk <= total) return { total: pk, kind: 'cart', pack: true, extras: Math.max(0, n - lim), freeExtra: 0, upsell: null, allPrice: pAll };
    return { total, kind: 'cart', freeExtra: Math.max(0, cov[n] - n), upsell: null, allPrice: pAll };
  }
  if (allowAll && pAll <= total) return { total: pAll, kind: 'all', freeExtra: 0, upsell: null, allPrice: pAll };
  const upsell = allowAll && n >= 2 ? { extra: pAll - total, price: pAll } : null;
  return { total, kind: 'cart', freeExtra: Math.max(0, cov[n] - n), upsell, allPrice: pAll };
}

// Pacotes avulsos: limpa e valida [{n, cents}] (n de 1 a 300, preço mínimo R$ 1). Devolve null se não sobrar nenhum.
export function normalizeTiers(arr) {
  if (!Array.isArray(arr)) return null;
  const m = new Map();
  for (const x of arr) {
    const n = Math.floor(Number(x && x.n)), cents = Math.round(Number(x && x.cents));
    if (n >= 1 && n <= 300 && Number.isFinite(cents) && cents >= 100) m.set(n, cents);
  }
  const out = [...m].map(([n, cents]) => ({ n, cents })).sort((a, b) => a.n - b.n);
  return out.length ? out : null;
}
export function parseTiers(cfg) {
  let t = null;
  if (cfg.price_tiers) { try { t = normalizeTiers(JSON.parse(cfg.price_tiers)); } catch (_) { t = null; } }
  return t || normalizeTiers([{ n: 1, cents: cfg.price_one_cents }, { n: 4, cents: cfg.price_four_cents }]) || [{ n: 1, cents: 1500 }];
}

export function reais(cents) {
  return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',').replace(',00', '');
}
