// Pacote com limite: "até N fotos por R$ X, fotos adicionais por R$ Y cada".
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDB, makeR2 } from './helpers.js';
import * as event from '../functions/api/event.js';
import * as presale from '../functions/api/presale.js';
import * as checkout from '../functions/api/checkout.js';
import * as quote from '../functions/api/quote.js';
import * as pedido from '../functions/api/pedido/[token].js';
import * as escolher from '../functions/api/pedido/[token]/escolher.js';
import * as webhook from '../functions/api/webhook/mercadopago.js';
import * as dl from '../functions/api/dl/[id].js';

const env = { DB: makeDB(), FOTOS: makeR2(), MP_ACCESS_TOKEN: 'TEST', ADMIN_PASSWORD: 'segredo' };
const req = (path, init) => new Request('https://fotos.test' + path, init);
const post = (path, body) => req(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const payments = {}; let lastPref;
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.endsWith('/checkout/preferences')) { lastPref = JSON.parse(init.body); return new Response(JSON.stringify({ init_point: 'https://mp.test/pay/' + lastPref.external_reference }), { status: 201 }); }
  const m = url.match(/\/v1\/payments\/(\w+)$/);
  if (m && payments[m[1]]) return new Response(JSON.stringify(payments[m[1]]));
  return new Response('{}', { status: 404 });
};
const pay = async (cents) => {
  const id = String(Math.floor(Math.random() * 1e9));
  payments[id] = { id, status: 'approved', transaction_amount: cents / 100, external_reference: lastPref.external_reference };
  await webhook.onRequestPost({ request: post(`/w?type=payment&data.id=${id}`, {}), env });
};
const cfg = (k, v) => env.DB.prepare('INSERT OR REPLACE INTO event_config (event_id, key, value) VALUES (1, ?, ?)').bind(k, String(v)).run();
const photo = async (id, athlete) => {
  await env.DB.prepare("INSERT INTO photos (id, filename, has_orig, has_prev, created_at) VALUES (?, ?, 1, 1, 'x')").bind(id, id + '.jpg').run();
  await env.FOTOS.put('orig/' + id, new TextEncoder().encode('ORIG-' + id));
  if (athlete) await env.DB.prepare('INSERT INTO photo_athletes (photo_id, athlete_id) VALUES (?, ?)').bind(id, athlete).run();
};
const get = async (t) => (await pedido.onRequestGet({ params: { token: t }, request: req('/x'), env })).json();
const buyer = { name: 'Maria', pin: '1234', email: 'a@b.com', whatsapp: '27999991234' };

test('a página mostra o limite e o preço da foto adicional', async () => {
  await cfg('pack_limit', 3); await cfg('pack_extra_cents', 200); await cfg('presale_limit', 3); await cfg('presale_extra_cents', 200);
  const e = await (await event.onRequestGet({ request: req('/api/event'), env })).json();
  assert.equal(e.packLimit, 3); assert.equal(e.packExtra, 200);
  await cfg('pack_extra_cents', 0); await cfg('presale_extra_cents', 0); // sem preço da foto adicional o limite não liga
  assert.equal((await (await event.onRequestGet({ request: req('/api/event'), env })).json()).packLimit, 0);
  await cfg('pack_extra_cents', 200); await cfg('presale_extra_cents', 200);
});

test('pré-venda: atleta com até N fotos recebe todas; com mais, escolhe N (uma vez)', async () => {
  const pre = await (await presale.onRequestPost({ request: post('/api/presale', { athleteId: 1, ...buyer }), env })).json();
  await pay(5000);
  for (const id of ['f1', 'f2']) await photo(id, 1);
  let p = await get(pre.token);
  assert.equal(p.photos.length, 2, 'até o limite: libera todas');
  await photo('f3', 1); await photo('f4', 1); await photo('f5', 1); await photo('de-outro', 2);
  p = await get(pre.token);
  assert.equal(p.photos.length, 0, 'acima do limite: nada libera antes de escolher');
  assert.equal(p.pick.limit, 3); assert.equal(p.pick.total, 5); assert.equal(p.pick.options.length, 5);
  const esc = (ids) => escolher.onRequestPost({ params: { token: pre.token }, request: post('/x', { photoIds: ids }), env });
  assert.equal((await esc(['f1', 'f2', 'f3', 'f4'])).status, 400, 'mais que o limite');
  assert.equal((await esc(['de-outro'])).status, 400, 'foto de outro atleta');
  assert.equal((await esc(['f1', 'f2', 'f3'])).status, 200);
  assert.equal((await esc(['f4'])).status, 409, 'escolha vale uma vez');
  p = await get(pre.token);
  assert.deepEqual(p.photos.map((x) => x.id).sort(), ['f1', 'f2', 'f3']);
  assert.equal(p.pick.options, undefined);
  assert.equal((await dl.onRequestGet({ params: { id: 'f4' }, request: req(p.photos[0].url.replace(p.photos[0].id, 'f4')), env })).status, 403, 'f4 não está no pacote');
  env.token = pre.token;
});

test('fotos adicionais: R$ 2 cada, pedido ligado ao pacote e sem repetir foto', async () => {
  const ex = (ids) => checkout.onRequestPost({ request: post('/api/checkout', { x: env.token, photoIds: ids }), env });
  assert.equal((await ex(['f1'])).status, 400, 'já faz parte do pacote');
  assert.equal((await ex(['de-outro'])).status, 400);
  assert.equal((await checkout.onRequestPost({ request: post('/api/checkout', { x: 'inexistente', photoIds: ['f4'] }), env })).status, 404);
  const r = await (await ex(['f4', 'f5'])).json();
  assert.equal(r.total, 'R$ 4');
  assert.equal(lastPref.items[0].unit_price, 4);
  await pay(400);
  const p = await get(r.token);
  assert.deepEqual(p.photos.map((x) => x.id).sort(), ['f4', 'f5']);
});

test('pedido feito antes do limite continua sem limite', async () => {
  await cfg('pack_limit', 0); await cfg('presale_limit', 0);
  const old = await (await presale.onRequestPost({ request: post('/api/presale', { athleteId: 1, ...buyer }), env })).json();
  await pay(5000);
  await cfg('pack_limit', 2); await cfg('presale_limit', 2);
  const p = await get(old.token);
  assert.equal(p.photos.length, 5, 'comprou sem limite: leva todas as fotos do atleta');
  assert.equal(p.pick, null);
  await cfg('pack_limit', 3); await cfg('presale_limit', 3);
});

test('cotação na galeria: pacote + adicionais x pacotes avulsos', async () => {
  await cfg('presale_end', '2020-01-01T00:00:00Z'); await cfg('price_all_event_cents', 6000);
  const qt = async (n) => (await quote.onRequestGet({ request: req(`/api/quote?n=${n}&athlete=1`), env })).json();
  assert.equal((await qt(1)).total, 1500, 'poucas fotos: avulso sai mais barato');
  const q3 = await qt(5); // 5 fotos: avulso 55 (1+4) x pacote 60 + 2 x 2 = 64
  assert.equal(q3.total, 5500);
  const q12 = await qt(12); // avulso: 3x4 = 120; pacote: 60 + 9 x 2 = 78
  assert.equal(q12.total, 7800); assert.equal(q12.pack, true); assert.equal(q12.extras, 9); assert.notEqual(q12.kind, 'all');
  const ex = await (await quote.onRequestGet({ request: req('/api/quote?n=3&x=1'), env })).json();
  assert.equal(ex.total, 600);
});
