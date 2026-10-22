import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDB, makeR2 } from './helpers.js';
import { ensureSchema, resetSchemaCache } from '../functions/_lib/schema.js';
import * as presale from '../functions/api/presale.js';
import * as acesso from '../functions/api/acesso.js';
import * as webhook from '../functions/api/webhook/mercadopago.js';
import * as login from '../functions/api/admin/login.js';
import * as aOrders from '../functions/api/admin/orders.js';
import * as pedido from '../functions/api/pedido/[token].js';

const env = { DB: makeDB(), FOTOS: makeR2(), MP_ACCESS_TOKEN: 'TEST', ADMIN_PASSWORD: 'segredo' };
const req = (path, init) => new Request('https://fotos.test' + path, init);
const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
let lastPref; const payments = {};
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.endsWith('/checkout/preferences')) { lastPref = JSON.parse(init.body); return new Response(JSON.stringify({ init_point: 'https://mp.test/x' }), { status: 201 }); }
  const m = url.match(/\/v1\/payments\/(\w+)$/);
  return m && payments[m[1]] ? new Response(JSON.stringify(payments[m[1]])) : new Response('{}', { status: 404 });
};
const acc = (b) => acesso.onRequestPost({ request: post('/api/acesso', b), env });
let tok;

test('esquema se completa sozinho num banco só com 0001 e 0002', async () => {
  const old = { DB: makeDB(['0001_init.sql', '0002_atletas.sql']) };
  resetSchemaCache(); await ensureSchema(old); resetSchemaCache(); await ensureSchema(old); // 2x: idempotente
  const full = makeDB();
  const shape = async (db) => {
    const tables = (await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results.map((r) => r.name);
    const cols = {}; for (const t of tables) cols[t] = (await db.prepare(`PRAGMA table_info(${t})`).all()).results.map((r) => r.name).sort();
    return { tables, cols };
  };
  assert.deepEqual(await shape(old.DB), await shape(full));
});

test('compra exige senha de 4 a 6 números', async () => {
  const r = (pin) => presale.onRequestPost({ request: post('/p', { athleteId: 1, name: 'Maria', whatsapp: '(27) 99999-1234', pin }), env });
  for (const bad of [undefined, '12', 'abcd', '1234567']) assert.equal((await r(bad)).status, 400);
  const ok = await r('4321'); assert.equal(ok.status, 200);
  tok = (await ok.json()).token;
  payments['1'] = { id: 1, status: 'approved', transaction_amount: 50, external_reference: lastPref.external_reference };
  await webhook.onRequestPost({ request: post('/w?type=payment&data.id=1', {}), env });
});

test('acesso: WhatsApp + senha leva ao pedido; formatos do número tanto faz', async () => {
  for (const w of ['27999991234', '(27) 99999-1234', '+55 27 99999-1234']) {
    const r = await acc({ whatsapp: w, pin: '4321' }); assert.equal(r.status, 200, w);
    const d = await r.json(); assert.equal(d.orders.length, 1); assert.equal(d.orders[0].token, tok); assert.equal(d.orders[0].status, 'pago');
  }
  const p = await (await pedido.onRequestGet({ params: { token: tok }, request: req('/x'), env })).json();
  assert.equal(p.status, 'pago');
});

test('acesso: senha errada, número desconhecido e bloqueio após 5 erros', async () => {
  assert.equal((await acc({ whatsapp: '27999991234', pin: '0000' })).status, 401);
  assert.equal((await acc({ whatsapp: '27911112222', pin: '4321' })).status, 401);
  assert.equal((await acc({ whatsapp: '27999991234', pin: '4321' })).status, 200, 'acerto zera o contador');
  for (let i = 0; i < 4; i++) assert.equal((await acc({ whatsapp: '27999991234', pin: '1111' })).status, 401);
  assert.equal((await acc({ whatsapp: '27999991234', pin: '1111' })).status, 401, '5º erro trava');
  const locked = await acc({ whatsapp: '27999991234', pin: '4321' });
  assert.equal(locked.status, 429, 'mesmo a senha certa fica travada');
  assert.match((await locked.json()).error, /Muitas tentativas/);
});

test('painel redefine a senha do comprador', async () => {
  const { token } = await (await login.onRequestPost({ request: post('/l', { password: 'segredo' }), env })).json();
  const H = { authorization: 'Bearer ' + token };
  const list = await (await aOrders.onRequestGet({ request: req('/o', { headers: H }), env })).json();
  const id = list.orders[0].id;
  assert.equal((await aOrders.onRequestPost({ request: post('/o', { id, action: 'senha', pin: 'ab' }, H), env })).status, 400);
  assert.equal((await aOrders.onRequestPost({ request: post('/o', { id, action: 'senha', pin: '9999' }, H), env })).status, 200);
  await env.DB.prepare('DELETE FROM access_attempts').run();
  assert.equal((await acc({ whatsapp: '27999991234', pin: '4321' })).status, 401);
  assert.equal((await acc({ whatsapp: '27999991234', pin: '9999' })).status, 200);
});
