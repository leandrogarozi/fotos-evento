// Roda os handlers de verdade contra SQLite em memória (imita o D1) e um Mercado Pago falso.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { hmacHex } from '../functions/_lib/util.js';
import { verifySignature } from '../functions/_lib/mp.js';
import * as event from '../functions/api/event.js';
import * as presale from '../functions/api/presale.js';
import * as pedido from '../functions/api/pedido/[token].js';
import * as webhook from '../functions/api/webhook/mercadopago.js';
import * as login from '../functions/api/admin/login.js';
import * as aOrders from '../functions/api/admin/orders.js';
import * as aConfig from '../functions/api/admin/config.js';
import * as aAth from '../functions/api/admin/athletes.js';

function makeDB() {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_init.sql', '0002_atletas.sql']) db.exec(readFileSync(new URL('../migrations/' + f, import.meta.url), 'utf8'));
  const prep = (sql) => {
    const mk = (args) => ({
      first: async () => db.prepare(sql).get(...args) ?? null,
      all: async () => ({ results: db.prepare(sql).all(...args) }),
      run: async () => { db.prepare(sql).run(...args); return {}; },
    });
    const s = { bind: (...args) => ({ ...mk(args), _sql: sql, _args: args }), ...mk([]) };
    return s;
  };
  return { prepare: prep, batch: async (stmts) => { for (const s of stmts) await s.run(); } };
}

const env = { DB: makeDB(), MP_ACCESS_TOKEN: 'TEST-token', ADMIN_PASSWORD: 'segredo' };
const req = (path, init) => new Request('https://fotos.test' + path, init);
const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

// Mercado Pago falso
const payments = {};
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.endsWith('/checkout/preferences')) {
    const b = JSON.parse(init.body);
    payments._pref = b;
    return new Response(JSON.stringify({ init_point: 'https://mp.test/pay/' + b.external_reference }), { status: 201 });
  }
  if (url.includes('/v1/payments/search')) {
    const ref = new URL(url).searchParams.get('external_reference');
    return new Response(JSON.stringify({ results: Object.values(payments).filter((p) => p.external_reference === ref) }));
  }
  const m = url.match(/\/v1\/payments\/(\w+)$/);
  if (m && payments[m[1]]) return new Response(JSON.stringify(payments[m[1]]));
  return new Response('{}', { status: 404 });
};

test('lista de atletas: 38, agrupados por turma, sem a Luana duplicada', async () => {
  const d = await (await event.onRequestGet({ env })).json();
  assert.equal(d.athletes.length, 38);
  assert.equal(d.athletes.filter((a) => a.name === 'Luana Souza').length, 1);
  assert.equal(d.athletes[0].turma, 'RX');
});

let tokenPedido, orderId;
test('pré-venda cria pedido e preferência com external_reference e valor do servidor', async () => {
  const bad = await presale.onRequestPost({ request: post('/api/presale', { athleteId: 1, name: 'A', whatsapp: '1' }), env });
  assert.equal(bad.status, 400);
  const res = await presale.onRequestPost({ request: post('/api/presale', { athleteId: 1, name: 'Maria Silva', whatsapp: '(27) 99999-1234', amount_cents: 1 }), env });
  const d = await res.json();
  assert.equal(res.status, 200);
  assert.match(d.url, /^https:\/\/mp\.test\/pay\//);
  tokenPedido = d.token;
  assert.equal(payments._pref.items[0].unit_price, 50);
  orderId = payments._pref.external_reference;
  const p = await (await pedido.onRequestGet({ params: { token: tokenPedido }, request: req('/x'), env })).json();
  assert.equal(p.status, 'aguardando');
});

test('webhook só libera com pagamento approved e valor certo', async () => {
  payments['111'] = { id: 111, status: 'pending', transaction_amount: 50, external_reference: orderId };
  await webhook.onRequestPost({ request: post('/api/webhook/mercadopago?type=payment&data.id=111', {}), env });
  let p = await (await pedido.onRequestGet({ params: { token: tokenPedido }, request: req('/x'), env })).json();
  assert.equal(p.status, 'aguardando');

  payments['112'] = { id: 112, status: 'approved', transaction_amount: 1, external_reference: orderId };
  await webhook.onRequestPost({ request: post('/api/webhook/mercadopago?type=payment&data.id=112', {}), env });
  p = await (await pedido.onRequestGet({ params: { token: tokenPedido }, request: req('/x'), env })).json();
  assert.equal(p.status, 'aguardando', 'valor menor não libera');

  payments['113'] = { id: 113, status: 'approved', transaction_amount: 50, external_reference: orderId };
  await webhook.onRequestPost({ request: post('/api/webhook/mercadopago?type=payment&data.id=113', {}), env });
  p = await (await pedido.onRequestGet({ params: { token: tokenPedido }, request: req('/x'), env })).json();
  assert.equal(p.status, 'pago');
});

test('sem webhook, ?sync=1 acha o pagamento pelo external_reference', async () => {
  const r = await (await presale.onRequestPost({ request: post('/api/presale', { athleteId: 2, name: 'João', whatsapp: '27988887777' }), env })).json();
  const id = payments._pref.external_reference;
  payments['200'] = { id: 200, status: 'approved', transaction_amount: 50, external_reference: id };
  const p = await (await pedido.onRequestGet({ params: { token: r.token }, request: req('/x?sync=1'), env })).json();
  assert.equal(p.status, 'pago');
});

test('painel: senha, lista, total, liberar manual, config e atletas', async () => {
  assert.equal((await login.onRequestPost({ request: post('/l', { password: 'errada' }), env })).status, 401);
  const { token } = await (await login.onRequestPost({ request: post('/l', { password: 'segredo' }), env })).json();
  const H = { authorization: 'Bearer ' + token };
  assert.equal((await aOrders.onRequestGet({ request: req('/o'), env })).status, 401);

  let d = await (await aOrders.onRequestGet({ request: req('/o', { headers: H }), env })).json();
  assert.equal(d.orders.length, 2);
  assert.equal(d.totalCents, 10000);

  const r = await (await presale.onRequestPost({ request: post('/api/presale', { athleteId: 3, name: 'Ana', whatsapp: '27977776666' }), env })).json();
  d = await (await aOrders.onRequestGet({ request: req('/o', { headers: H }), env })).json();
  const pend = d.orders.find((o) => o.status === 'aguardando');
  await aOrders.onRequestPost({ request: post('/o', { id: pend.id, action: 'liberar' }, H), env });
  d = await (await aOrders.onRequestGet({ request: req('/o', { headers: H }), env })).json();
  assert.equal(d.totalCents, 15000);

  const c = await (await aConfig.onRequestPost({ request: post('/c', { presale_price_cents: '100', hack: 'x' }, H), env })).json();
  assert.equal(c.presale_price_cents, 100);
  await presale.onRequestPost({ request: post('/api/presale', { athleteId: 4, name: 'Teste', whatsapp: '27966665555' }), env });
  assert.equal(payments._pref.items[0].unit_price, 1);

  await aAth.onRequestPost({ request: post('/a', { action: 'toggle', id: 38, active: false }, H), env });
  const ev = await (await event.onRequestGet({ env })).json();
  assert.equal(ev.athletes.length, 37);
});

test('assinatura do webhook confere (formato do Mercado Pago)', async () => {
  const secret = 's3'; const ts = '1700000000'; const reqId = 'abc-123';
  const v1 = await hmacHex(secret, `id:999;request-id:${reqId};ts:${ts};`);
  const mk = (sig) => req('/w', { method: 'POST', headers: { 'x-signature': sig, 'x-request-id': reqId } });
  assert.equal(await verifySignature(mk(`ts=${ts},v1=${v1}`), '999', secret), true);
  assert.equal(await verifySignature(mk(`ts=${ts},v1=${v1}`), '998', secret), false);
});
