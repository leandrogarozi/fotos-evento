import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDB, makeR2 } from './helpers.js';
import { DEFAULTS, salesCloseAt, salesOpen } from '../functions/_lib/pricing.js';
import * as event from '../functions/api/event.js';
import * as presale from '../functions/api/presale.js';
import * as checkout from '../functions/api/checkout.js';
import * as acesso from '../functions/api/acesso.js';
import * as webhook from '../functions/api/webhook/mercadopago.js';

test('regras do encerramento: data fixa, ou N dias depois de publicar', () => {
  assert.equal(salesCloseAt(DEFAULTS), null); assert.equal(salesOpen(DEFAULTS), true);
  const fixa = { ...DEFAULTS, sales_end: '2026-10-30T02:59:59Z' };
  assert.equal(salesCloseAt(fixa), Date.parse('2026-10-30T02:59:59Z'));
  assert.equal(salesOpen(fixa, Date.parse('2026-10-29T00:00:00Z')), true); assert.equal(salesOpen(fixa, Date.parse('2026-10-31T00:00:00Z')), false);
  const dias = { ...DEFAULTS, published_at: '2026-10-26T12:00:00Z', sales_days: 3 };
  assert.equal(salesCloseAt(dias), Date.parse('2026-10-29T12:00:00Z'));
  assert.equal(salesCloseAt({ ...dias, published_at: '' }), null, 'sem data de publicação não há prazo');
  assert.equal(salesCloseAt({ ...dias, sales_end: '2026-10-27T00:00:00Z' }), Date.parse('2026-10-27T00:00:00Z'), 'data fixa vale mais');
});

test('vendas encerradas bloqueiam compra, mas quem já comprou continua entrando', async () => {
  const env = { DB: makeDB(), FOTOS: makeR2(), MP_ACCESS_TOKEN: 'T', ADMIN_PASSWORD: 'x' };
  const req = (b) => new Request('https://f.test/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  let pref; globalThis.fetch = async (url, init) => { url = String(url);
    if (url.endsWith('/checkout/preferences')) { pref = JSON.parse(init.body); return new Response(JSON.stringify({ init_point: 'https://mp.test/x' }), { status: 201 }); }
    return new Response(JSON.stringify({ id: 1, status: 'approved', transaction_amount: 50, external_reference: pref.external_reference }), { status: 200 }); };
  const body = { athleteId: 1, name: 'Maria', whatsapp: '27999991234', email: 'm@b.com', pin: '4321' };
  assert.equal((await presale.onRequestPost({ request: req(body), env })).status, 200, 'aberto: compra');
  await webhook.onRequestPost({ request: new Request('https://f.test/w?type=payment&data.id=1', { method: 'POST', body: '{}' }), env });
  assert.equal((await (await event.onRequestGet({ env })).json()).salesClosed, false);

  await env.DB.prepare("INSERT OR REPLACE INTO event_config (event_id, key, value) VALUES (1, 'sales_end', '2020-01-01T00:00:00Z')").run();
  const ev = await (await event.onRequestGet({ env })).json();
  assert.equal(ev.salesClosed, true); assert.equal(ev.salesEnd, '2020-01-01T00:00:00.000Z');
  assert.equal((await presale.onRequestPost({ request: req(body), env })).status, 410);
  assert.equal((await checkout.onRequestPost({ request: req({ ...body, all: true }), env })).status, 410);
  assert.equal((await acesso.onRequestPost({ request: req({ whatsapp: '27999991234', pin: '4321' }), env })).status, 200, 'quem comprou continua acessando');
});

test('textos das páginas: padrão, edição pelo painel e volta ao padrão se ficar vazio', async () => {
  const { DEFAULTS } = await import('../functions/_lib/pricing.js');
  const aConfig = await import('../functions/api/admin/config.js');
  const login = await import('../functions/api/admin/login.js');
  const env = { DB: makeDB(), FOTOS: makeR2(), ADMIN_PASSWORD: 'x' };
  const p = (path, b, h = {}) => new Request('https://f.test' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
  let ev = await (await event.onRequestGet({ env })).json();
  assert.equal(ev.texts.txt_presale_title, DEFAULTS.txt_presale_title);
  const { token } = await (await login.onRequestPost({ request: p('/l', { password: 'x' }), env })).json();
  const H = { authorization: 'Bearer ' + token };
  await aConfig.onRequestPost({ request: p('/c', { event_name: 'Vida Ativa', txt_presale_title: 'Garanta *suas fotos* do Vida Ativa', txt_store_lead: '' }, H), env });
  ev = await (await event.onRequestGet({ env })).json();
  assert.equal(ev.eventName, 'Vida Ativa');
  assert.equal(ev.texts.txt_presale_title, 'Garanta *suas fotos* do Vida Ativa');
  assert.equal(ev.texts.txt_store_lead, DEFAULTS.txt_store_lead, 'vazio volta ao padrão');
  const cfg = await (await aConfig.onRequestGet({ request: new Request('https://f.test/c', { headers: H }), env })).json();
  assert.ok('txt_claim_lead' in cfg);
});

test('painel salva pacotes personalizados e o site passa a usá-los; recusa pacotes inválidos', async () => {
  const aConfig = await import('../functions/api/admin/config.js');
  const login = await import('../functions/api/admin/login.js');
  const quote = await import('../functions/api/quote.js');
  const env = { DB: makeDB(), FOTOS: makeR2(), ADMIN_PASSWORD: 'x' };
  const p = (path, b, h = {}) => new Request('https://f.test' + path, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
  const { token } = await (await login.onRequestPost({ request: p('/l', { password: 'x' }), env })).json();
  const H = { authorization: 'Bearer ' + token };
  assert.equal((await aConfig.onRequestPost({ request: p('/c', { price_tiers: JSON.stringify([{ n: 0, cents: 5 }]) }, H), env })).status, 400);
  const ok = await aConfig.onRequestPost({ request: p('/c', { price_tiers: JSON.stringify([{ n: 1, cents: 1500 }, { n: 2, cents: 3000 }, { n: 3, cents: 4000 }]) }, H), env });
  assert.equal(ok.status, 200); assert.equal((await ok.json()).tiers.length, 3);
  const ev = await (await event.onRequestGet({ env })).json();
  assert.deepEqual(ev.tiers.map((t) => t.n), [1, 2, 3]);
  await env.DB.prepare("INSERT OR REPLACE INTO event_config (event_id, key, value) VALUES (1, 'presale_end', '2020-01-01T00:00:00Z')").run();
  const q = await (await quote.onRequestGet({ request: new Request('https://f.test/q?n=2'), env })).json();
  assert.equal(q.total, 3000);
});
