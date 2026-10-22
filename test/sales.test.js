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

  await env.DB.prepare("INSERT INTO config (key, value) VALUES ('sales_end', '2020-01-01T00:00:00Z')").run();
  const ev = await (await event.onRequestGet({ env })).json();
  assert.equal(ev.salesClosed, true); assert.equal(ev.salesEnd, '2020-01-01T00:00:00.000Z');
  assert.equal((await presale.onRequestPost({ request: req(body), env })).status, 410);
  assert.equal((await checkout.onRequestPost({ request: req({ ...body, all: true }), env })).status, 410);
  assert.equal((await acesso.onRequestPost({ request: req({ whatsapp: '27999991234', pin: '4321' }), env })).status, 200, 'quem comprou continua acessando');
});
