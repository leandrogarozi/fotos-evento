// Fluxo da loja: upload (R2 falso), vitrine, carrinho, pagamento e download.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDB, makeR2 } from './helpers.js';
import * as event from '../functions/api/event.js';
import * as presale from '../functions/api/presale.js';
import * as checkout from '../functions/api/checkout.js';
import * as quote from '../functions/api/quote.js';
import * as photosApi from '../functions/api/photos.js';
import * as pedido from '../functions/api/pedido/[token].js';
import * as webhook from '../functions/api/webhook/mercadopago.js';
import * as login from '../functions/api/admin/login.js';
import * as aPhotos from '../functions/api/admin/photos.js';
import * as aPhoto from '../functions/api/admin/photo.js';
import * as aPhotoDel from '../functions/api/admin/photo/[id].js';
import * as aPhotoPut from '../functions/api/admin/photo/[id]/[kind].js';
import * as claim from '../functions/api/claim.js';
import * as dl from '../functions/api/dl/[id].js';
import * as img from '../functions/img/[id].js';

const env = { DB: makeDB(), FOTOS: makeR2(), MP_ACCESS_TOKEN: 'TEST', ADMIN_PASSWORD: 'segredo' };
const req = (path, init) => new Request('https://fotos.test' + path, init);
const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const bytes = (txt) => new TextEncoder().encode(txt);

const payments = {};
let lastPref;
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.endsWith('/checkout/preferences')) {
    lastPref = JSON.parse(init.body);
    return new Response(JSON.stringify({ init_point: 'https://mp.test/pay/' + lastPref.external_reference }), { status: 201 });
  }
  const m = url.match(/\/v1\/payments\/(\w+)$/);
  if (m && payments[m[1]]) return new Response(JSON.stringify(payments[m[1]]));
  return new Response('{}', { status: 404 });
};
const pay = async (amountCents) => {
  const id = String(Math.floor(Math.random() * 1e9));
  payments[id] = { id, status: 'approved', transaction_amount: amountCents / 100, external_reference: lastPref.external_reference };
  await webhook.onRequestPost({ request: post(`/w?type=payment&data.id=${id}`, {}), env });
};

let H;
const upload = async (filename, athleteIds, origTxt) => {
  const { id } = await (await aPhoto.onRequestPost({ request: post('/p', { filename, athleteIds, geral: !athleteIds.length }, H), env })).json();
  for (const [kind, txt] of [['orig', origTxt], ['prev', 'PREVIEW-' + origTxt]]) {
    const r = await aPhotoPut.onRequestPut({ params: { id, kind }, request: req('/x', { method: 'PUT', headers: H, body: bytes(txt) }), env });
    assert.equal(r.status, 200);
  }
  return id;
};
const orderOf = async (tokenOrder) => (await pedido.onRequestGet({ params: { token: tokenOrder }, request: req('/x'), env })).json();

test('pré-venda de atleta ainda sem fotos; depois do upload libera sozinha', async () => {
  const pre = await (await presale.onRequestPost({ request: post('/api/presale', { athleteId: 1, name: 'Maria', pin: '1234', email: 'a@b.com', whatsapp: '27999991234' }), env })).json();
  await pay(5000);
  let p = await orderOf(pre.token);
  assert.equal(p.status, 'pago');
  assert.equal(p.photos.length, 0);

  const { token } = await (await login.onRequestPost({ request: post('/l', { password: 'segredo' }), env })).json();
  H = { authorization: 'Bearer ' + token };
  assert.equal((await aPhoto.onRequestPost({ request: post('/p', { filename: 'x.jpg', athleteIds: [1] }), env })).status, 401);

  await upload('a1.jpg', [1], 'ORIG-A1');
  p = await orderOf(pre.token);
  assert.equal(p.photos.length, 1, 'a pré-venda liberou sozinha');
  const r = await dl.onRequestGet({ params: { id: p.photos[0].id }, request: req(p.photos[0].url), env });
  assert.equal(r.status, 200);
  assert.equal(await r.text(), 'ORIG-A1', 'baixa a ORIGINAL, não a vitrine');
});

let ids;
test('vitrine: lista por atleta e geral; preview público; original nunca exposta', async () => {
  const a2 = await upload('a2.jpg', [1], 'ORIG-A2');
  const a3 = await upload('a3.jpg', [1, 2], 'ORIG-A3'); // foto com dois atletas
  const a4 = await upload('a4.jpg', [1], 'ORIG-A4');
  const b1 = await upload('b1.jpg', [2], 'ORIG-B1');
  ids = { a2, a3, a4, b1 };
  const l1 = await (await photosApi.onRequestGet({ request: req('/api/photos?athlete=1'), env })).json();
  const l2 = await (await photosApi.onRequestGet({ request: req('/api/photos?athlete=2'), env })).json();
  const all = await (await photosApi.onRequestGet({ request: req('/api/photos'), env })).json();
  assert.equal(l1.photos.length, 4); assert.equal(l2.photos.length, 2); assert.equal(all.photos.length, 5);
  const r = await img.onRequestGet({ params: { id: a2 }, env });
  assert.equal(await r.text(), 'PREVIEW-ORIG-A2');
  assert.equal(JSON.stringify([l1, all, await (await event.onRequestGet({ env })).json()]).includes('orig/'), false);
  const adm = await (await aPhotos.onRequestGet({ request: req('/a', { headers: H }), env })).json();
  assert.equal(adm.total, 5); assert.equal(adm.athletes.find((a) => a.id === 1).n, 4);
});

test('upload incompleto (sem prévia) não aparece na vitrine', async () => {
  const { id } = await (await aPhoto.onRequestPost({ request: post('/p', { filename: 'meio.jpg', athleteIds: [3] }, H), env })).json();
  await aPhotoPut.onRequestPut({ params: { id, kind: 'orig' }, request: req('/x', { method: 'PUT', headers: H, body: bytes('x') }), env });
  const l = await (await photosApi.onRequestGet({ request: req('/api/photos?athlete=3'), env })).json();
  assert.equal(l.photos.length, 0);
});

test('cotação: 1=15, 2=30, 3=40 (+1 grátis), 5=55 (sugere pacote); sem atleta não tem pacote', async () => {
  const qt = async (n, a) => (await quote.onRequestGet({ request: req(`/api/quote?n=${n}${a ? '&athlete=1' : ''}`), env })).json();
  // pré-venda encerrada para o teste: coloca o fim da pré-venda no passado
  await env.DB.prepare("INSERT INTO config (key, value) VALUES ('presale_end', '2020-01-01T00:00:00Z')").run();
  assert.equal((await qt(1, 1)).total, 1500);
  assert.equal((await qt(2, 1)).total, 3000);
  const t3 = await qt(3, 1); assert.equal(t3.total, 4000); assert.equal(t3.freeExtra, 1);
  assert.equal((await qt(5, 1)).total, 5500);
  assert.equal((await qt(5, 1)).upsell.price, 6000);
  assert.equal((await qt(6, 1)).kind, 'all');
  assert.equal((await qt(8, 0)).total, 8000, 'galeria geral: 2 pacotes de 4');
});

test('carrinho de 3 fotos: cobra 40, paga e baixa só as 3 escolhidas', async () => {
  const sel = [ids.a2, ids.a3, ids.b1];
  const c = await (await checkout.onRequestPost({ request: post('/api/checkout', { athleteId: 1, photoIds: sel, name: 'João', pin: '1234', email: 'a@b.com', whatsapp: '27988887777', amount_cents: 1 }), env })).json();
  assert.equal(lastPref.items[0].unit_price, 40);
  let p = await orderOf(c.token);
  assert.equal(p.status, 'aguardando'); assert.equal(p.photos.length, 0);
  assert.equal((await dl.onRequestGet({ params: { id: ids.a2 }, request: req(`/api/dl/${ids.a2}?t=${c.token}&e=9999999999999&s=fake`), env })).status, 403);
  await pay(4000);
  p = await orderOf(c.token);
  assert.equal(p.photos.length, 3);
  const ok = await dl.onRequestGet({ params: { id: ids.a2 }, request: req(p.photos.find((x) => x.id === ids.a2).url), env });
  assert.equal(await ok.text(), 'ORIG-A2');
  // foto que não comprou, com assinatura válida do mesmo pedido
  const url = p.photos[0].url.replace(/\/dl\/[^?]+/, '/dl/' + ids.a4);
  assert.equal((await dl.onRequestGet({ params: { id: ids.a4 }, request: req(url), env })).status, 403);
  // link vencido
  const old = p.photos[0].url.replace(/e=\d+/, 'e=1');
  assert.equal((await dl.onRequestGet({ params: { id: p.photos[0].id }, request: req(old), env })).status, 403);
});

test('carrinho de 6 fotos do atleta vira pacote "todas" (libera até as não escolhidas)', async () => {
  const six = [ids.a2, ids.a3, ids.a4, await upload('a5.jpg', [1], 'ORIG-A5'), await upload('a6.jpg', [1], 'ORIG-A6'), await upload('a7.jpg', [1], 'ORIG-A7')];
  const c = await (await checkout.onRequestPost({ request: post('/api/checkout', { athleteId: 1, photoIds: six, name: 'Ana', pin: '1234', email: 'a@b.com', whatsapp: '27977776666' }), env })).json();
  assert.equal(lastPref.items[0].unit_price, 60);
  await pay(6000);
  const p = await orderOf(c.token);
  assert.equal(p.kind, 'todas');
  assert.equal(p.photos.length, 7, 'todas as 7 fotos do atleta 1, inclusive a que não foi selecionada');
});

test('"Quero todas" e validações do checkout', async () => {
  const c = await (await checkout.onRequestPost({ request: post('/api/checkout', { athleteId: 2, all: true, name: 'Rui', pin: '1234', email: 'a@b.com', whatsapp: '27966665555' }), env })).json();
  assert.equal(lastPref.items[0].unit_price, 60);
  assert.ok(c.url);
  const r = (b) => checkout.onRequestPost({ request: post('/api/checkout', { name: 'Rui', pin: '1234', email: 'a@b.com', whatsapp: '27966665555', ...b }), env });
  assert.equal((await r({ photoIds: [] })).status, 400);
  assert.equal((await r({ photoIds: ['inexistente'] })).status, 400);
  assert.equal((await r({ all: true })).status, 400, 'todas exige atleta');
});

test('apagar foto remove do R2 e da vitrine', async () => {
  await aPhotoDel.onRequestDelete({ params: { id: ids.b1 }, request: req('/d', { method: 'DELETE', headers: H }), env });
  assert.equal(env.FOTOS.store.has(`orig/${ids.b1}`), false);
  const l = await (await photosApi.onRequestGet({ request: req('/api/photos?athlete=2'), env })).json();
  assert.equal(l.photos.length, 1);
});

test('fotos gerais (sem atleta): aparecem só na galeria geral e se apagam normalmente', async () => {
  const antes = (await (await photosApi.onRequestGet({ request: req('/api/photos'), env })).json()).photos.length;
  const g = await upload('torcida.jpg', [], 'ORIG-G');
  const geral = await (await photosApi.onRequestGet({ request: req('/api/photos?geral=1'), env })).json();
  assert.deepEqual(geral.photos, [g]);
  assert.equal((await (await photosApi.onRequestGet({ request: req('/api/photos'), env })).json()).photos.length, antes + 1);
  assert.equal((await (await photosApi.onRequestGet({ request: req('/api/photos?athlete=1'), env })).json()).photos.includes(g), false);
  assert.equal((await aPhoto.onRequestPost({ request: post('/p', { filename: 'x.jpg', athleteIds: [] }, H), env })).status, 400, 'sem atleta e sem marcar geral continua barrado');
  await aPhotoDel.onRequestDelete({ params: { id: g }, request: req('/d', { method: 'DELETE', headers: H }), env });
  assert.equal((await (await photosApi.onRequestGet({ request: req('/api/photos?geral=1'), env })).json()).photos.length, 0);
});

test('marcar as próprias fotos (pacote completo sem atleta nas fotos): baixa só as marcadas, respeita o limite', async () => {
  await env.DB.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('claim_enabled', '1')").run();
  const g = [await upload('g1.jpg', [], 'ORIG-G1'), await upload('g2.jpg', [], 'ORIG-G2'), await upload('g3.jpg', [], 'ORIG-G3')];
  const c = await (await checkout.onRequestPost({ request: post('/api/checkout', { athleteId: 3, all: true, name: 'Vanessa', pin: '1234', email: 'v@b.com', whatsapp: '27955554444' }), env })).json();
  const claimReq = (token, photoIds) => claim.onRequestPost({ request: post('/api/claim', { token, photoIds }), env });
  assert.equal((await claimReq(c.token, [g[0]])).status, 403, 'sem pagar não marca');
  await pay(6000);
  let p = await orderOf(c.token);
  assert.equal(p.photos.length, 0); assert.ok(p.galleryCount >= 3); assert.deepEqual(p.claimed, []);
  assert.equal((await claimReq(c.token, [g[0], g[1]])).status, 200);
  p = await orderOf(c.token);
  assert.deepEqual(p.photos.map((x) => x.id).sort(), [g[0], g[1]].sort()); assert.equal(p.claimed.length, 2);
  assert.equal(await (await dl.onRequestGet({ params: { id: g[0] }, request: req(p.photos.find((x) => x.id === g[0]).url), env })).text(), 'ORIG-G1');
  const url3 = p.photos[0].url.replace(/\/dl\/[^?]+/, '/dl/' + g[2]);
  assert.equal((await dl.onRequestGet({ params: { id: g[2] }, request: req(url3), env })).status, 403, 'não marcou, não baixa');
  assert.equal((await claimReq(c.token, [g[2]])).status, 200, 'nova marcação substitui a anterior');
  assert.deepEqual((await orderOf(c.token)).photos.map((x) => x.id), [g[2]]);
  await env.DB.prepare("INSERT INTO config (key, value) VALUES ('claim_max', '1')").run();
  assert.equal((await claimReq(c.token, [g[0], g[1]])).status, 400, 'passou do limite');
  assert.equal((await claimReq(c.token, ['inexistente'])).status, 400);
  assert.equal((await claimReq(c.token, [])).status, 200, 'limpar a seleção');
  await env.DB.prepare("DELETE FROM config WHERE key = 'claim_max'").run();
});

test('pedido de fotos avulsas não usa a marcação', async () => {
  const a = await upload('av.jpg', [], 'ORIG-AV');
  const c = await (await checkout.onRequestPost({ request: post('/api/checkout', { photoIds: [a], name: 'Rui', pin: '1234', email: 'r@b.com', whatsapp: '27944443333' }), env })).json();
  await pay(1500);
  assert.equal((await claim.onRequestPost({ request: post('/api/claim', { token: c.token, photoIds: [a] }), env })).status, 403);
  assert.equal((await orderOf(c.token)).photos.length, 1);
});

test('sem limite por padrão: marca muitas fotos de uma vez; exclusão em massa remove tudo', async () => {
  const many = []; for (let i = 0; i < 60; i++) many.push(await upload(`m${i}.jpg`, [], 'ORIG-M' + i));
  const c = await (await checkout.onRequestPost({ request: post('/api/checkout', { athleteId: 4, all: true, name: 'Beto', pin: '1234', email: 'b@b.com', whatsapp: '27933332222' }), env })).json();
  await pay(6000);
  const r = await claim.onRequestPost({ request: post('/api/claim', { token: c.token, photoIds: many }), env });
  assert.equal(r.status, 200);
  assert.equal((await orderOf(c.token)).photos.length, 60);
  const ev = await (await event.onRequestGet({ env })).json(); assert.equal(ev.claimMax, 0);
  // exclusão em massa
  const del = await aPhotos.onRequestPost({ request: post('/a', { action: 'delete', ids: many }, H), env });
  assert.equal((await del.json()).deleted, 60);
  assert.equal((await orderOf(c.token)).photos.length, 0);
  assert.equal(many.some((id) => env.FOTOS.store.has(`orig/${id}`) || env.FOTOS.store.has(`prev/${id}`)), false);
  assert.equal((await aPhotos.onRequestPost({ request: post('/a', { action: 'delete', ids: many }), env })).status, 401, 'só o admin apaga');
});

test('atribuir fotos gerais a um atleta (em massa), tirar e deixar sem atleta', async () => {
  const g1 = await upload('x1.jpg', [], 'ORIG-X1'), g2 = await upload('x2.jpg', [], 'ORIG-X2');
  const act = (b) => aPhotos.onRequestPost({ request: post('/a', b, H), env });
  const list = async (q) => (await (await photosApi.onRequestGet({ request: req('/api/photos' + q), env })).json()).photos;
  assert.equal((await act({ action: 'assign', ids: [g1, g2], athleteId: 99999 })).status, 400);
  assert.equal((await act({ action: 'assign', ids: [g1, g2], athleteId: 6 })).status, 200);
  assert.equal((await act({ action: 'assign', ids: [g1, g2], athleteId: 6 })).status, 200, 'repetir não duplica nem quebra');
  assert.deepEqual((await list('?athlete=6')).sort(), [g1, g2].sort());
  assert.equal((await list('?geral=1')).some((id) => [g1, g2].includes(id)), false, 'saiu das gerais');
  assert.equal((await list('')).includes(g1), true, 'continua na galeria geral de venda');
  // quem comprou o pacote do atleta passa a ver
  const c = await (await checkout.onRequestPost({ request: post('/api/checkout', { athleteId: 6, all: true, name: 'Gi', pin: '1234', email: 'g@b.com', whatsapp: '27922221111' }), env })).json();
  await pay(6000);
  assert.equal((await orderOf(c.token)).photos.length, 2);
  await act({ action: 'unassign', ids: [g1], athleteId: 6 });
  assert.deepEqual(await list('?athlete=6'), [g2]);
  assert.equal((await orderOf(c.token)).photos.length, 1);
  await act({ action: 'clear', ids: [g2] });
  assert.equal((await list('?athlete=6')).length, 0);
  assert.equal((await list('?geral=1')).includes(g2), true);
  assert.equal((await aPhotos.onRequestPost({ request: post('/a', { action: 'assign', ids: [g1], athleteId: 6 }), env })).status, 401);
});

test('marcação livre desligada: não aceita marcação e marcações antigas não liberam nada', async () => {
  const g = await upload('off.jpg', [], 'ORIG-OFF');
  const c = await (await checkout.onRequestPost({ request: post('/api/checkout', { athleteId: 7, all: true, name: 'Dani', pin: '1234', email: 'd@b.com', whatsapp: '27911110000' }), env })).json();
  await pay(6000);
  await env.DB.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('claim_enabled', '1')").run();
  assert.equal((await claim.onRequestPost({ request: post('/api/claim', { token: c.token, photoIds: [g] }), env })).status, 200);
  assert.equal((await orderOf(c.token)).photos.length, 1, 'ligado: a marcação libera');
  await env.DB.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('claim_enabled', '0')").run();
  const p = await orderOf(c.token);
  assert.equal(p.photos.length, 0, 'desligado: a marcação antiga não libera foto de outro atleta');
  assert.equal(p.claimEnabled, false);
  assert.equal((await claim.onRequestPost({ request: post('/api/claim', { token: c.token, photoIds: [g] }), env })).status, 403);
  assert.equal((await (await event.onRequestGet({ env })).json()).claimEnabled, false);
  // o que o Leandro atribui ao atleta continua liberando
  await aPhotos.onRequestPost({ request: post('/a', { action: 'assign', ids: [g], athleteId: 7 }, H), env });
  assert.equal((await orderOf(c.token)).photos.length, 1);
});

test('triagem: fila só com fotos sem atleta e não olhadas; geral sai da fila; deixar sem atleta volta', async () => {
  const [t1, t2, t3] = [await upload('t1.jpg', [], 'T1'), await upload('t2.jpg', [], 'T2'), await upload('t3.jpg', [], 'T3')];
  const queue = async () => (await (await photosApi.onRequestGet({ request: req('/api/photos?queue=1'), env })).json()).photos;
  const act = (b) => aPhotos.onRequestPost({ request: post('/a', b, H), env });
  assert.ok([t1, t2, t3].every((id) => queue.length || true));
  let q = await queue(); assert.ok(q.includes(t1) && q.includes(t2) && q.includes(t3));
  await act({ action: 'assign', ids: [t1], athleteId: 8 });
  await act({ action: 'geral', ids: [t2] });
  q = await queue();
  assert.equal(q.includes(t1), false, 'com atleta sai da fila'); assert.equal(q.includes(t2), false, 'geral confirmada sai da fila'); assert.equal(q.includes(t3), true);
  const geral = (await (await photosApi.onRequestGet({ request: req('/api/photos?geral=1'), env })).json()).photos;
  assert.equal(geral.includes(t2), true, 'continua nas fotos gerais'); assert.equal(geral.includes(t1), false);
  await act({ action: 'clear', ids: [t1, t2] });
  q = await queue(); assert.ok(q.includes(t1) && q.includes(t2), 'deixar sem atleta devolve para a fila');
});
