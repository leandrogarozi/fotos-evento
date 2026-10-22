import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDB, makeR2 } from './helpers.js';
import { ensureSchema, resetSchemaCache } from '../functions/_lib/schema.js';
import * as event from '../functions/api/event.js';
import * as photosApi from '../functions/api/photos.js';
import * as presale from '../functions/api/presale.js';
import * as checkout from '../functions/api/checkout.js';
import * as pedido from '../functions/api/pedido/[token].js';
import * as acesso from '../functions/api/acesso.js';
import * as webhook from '../functions/api/webhook/mercadopago.js';
import * as login from '../functions/api/admin/login.js';
import * as aEvents from '../functions/api/admin/events.js';
import * as aConfig from '../functions/api/admin/config.js';
import * as aAth from '../functions/api/admin/athletes.js';
import * as aOrders from '../functions/api/admin/orders.js';
import * as aPhoto from '../functions/api/admin/photo.js';
import * as aPhotoPut from '../functions/api/admin/photo/[id]/[kind].js';
import * as aPhotos from '../functions/api/admin/photos.js';
import { eventBySlug } from '../functions/_lib/events.js';

const OLD = ['0001_init.sql', '0002_atletas.sql', '0003_fotos.sql', '0004_acesso.sql', '0005_pin_enc.sql', '0006_triagem.sql']; // banco de antes dos eventos

test('migração de um banco que JÁ TEM dados: vira o evento principal, sem perder nada', async () => {
  const DB = makeDB(OLD);
  await DB.prepare("INSERT INTO config (key, value) VALUES ('event_name', 'Campeonato Interno de CrossFit')").run();
  await DB.prepare("INSERT INTO config (key, value) VALUES ('presale_price_cents', '5000')").run();
  await DB.prepare("INSERT INTO config (key, value) VALUES ('txt_presale_title', 'Garanta *suas fotos* do campeonato')").run();
  await DB.prepare("INSERT INTO orders (id, token, athlete_id, buyer_name, whatsapp, email, kind, amount_cents, status, created_at, presale, pin_salt, pin_hash) VALUES ('o1','tok1',1,'Maria','27999991234','m@b.com','todas',5000,'pago','2026-10-22T10:00:00Z',1,'s','h')").run();
  const env = { DB, FOTOS: makeR2(), ADMIN_PASSWORD: 'x' };
  resetSchemaCache(); await ensureSchema(env); resetSchemaCache(); await ensureSchema(env); // 2x: idempotente
  const main = await eventBySlug(env, '');
  assert.equal(main.id, 1); assert.equal(main.is_main, 1); assert.equal(main.name, 'Campeonato Interno de CrossFit');
  const ev = await (await event.onRequestGet({ request: new Request('https://f.test/api/event'), env })).json();
  assert.equal(ev.eventName, 'Campeonato Interno de CrossFit'); assert.equal(ev.texts.txt_presale_title, 'Garanta *suas fotos* do campeonato');
  assert.equal(ev.allPrice, 5000, 'preço salvo antes continua valendo'); assert.equal(ev.athletes.length, 38, 'os 38 atletas seguem no evento principal');
  const p = await (await pedido.onRequestGet({ params: { token: 'tok1' }, request: new Request('https://f.test/x'), env })).json();
  assert.equal(p.status, 'pago'); assert.equal(p.eventSlug, 'principal', 'pedido antigo pertence ao evento principal');
});

// ---------- isolamento entre eventos ----------
const env = { DB: makeDB(), FOTOS: makeR2(), MP_ACCESS_TOKEN: 'T', ADMIN_PASSWORD: 'x', MAIL_WEBHOOK_URL: 'https://script.test/exec', MAIL_WEBHOOK_SECRET: 's' };
const R = (path, init) => new Request('https://f.test' + path, init);
const P = (path, b, h = {}) => R(path, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify(b) });
let pref; const mails = [];
globalThis.fetch = async (url, init) => { url = String(url);
  if (url === 'https://script.test/exec') { mails.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: true })); }
  if (url.endsWith('/checkout/preferences')) { pref = JSON.parse(init.body); return new Response(JSON.stringify({ init_point: 'https://mp.test/x' }), { status: 201 }); }
  return new Response(JSON.stringify({ id: 1, status: 'approved', transaction_amount: pref.items[0].unit_price, external_reference: pref.external_reference })); };
let H, vida;
const adm = (ev) => ({ ...H, ...(ev ? { 'x-event': String(ev) } : {}) });

test('criar evento novo copiando preços e textos do principal; datas não são copiadas', async () => {
  const { token } = await (await login.onRequestPost({ request: P('/l', { password: 'x' }), env })).json(); H = { authorization: 'Bearer ' + token };
  await aConfig.onRequestPost({ request: P('/c', { presale_price_cents: '4500', price_tiers: JSON.stringify([{ n: 1, cents: 2000 }]), published_at: '2026-10-26T00:00:00Z' }, adm(1)), env });
  assert.equal((await aEvents.onRequestPost({ request: P('/e', { action: 'create', name: 'x' }, H), env })).status, 400);
  const c = await (await aEvents.onRequestPost({ request: P('/e', { action: 'create', name: 'CrossFit Vida Ativa', copyFrom: 1 }, H), env })).json();
  assert.equal(c.slug, 'crossfit-vida-ativa'); vida = c.id;
  const again = await (await aEvents.onRequestPost({ request: P('/e', { action: 'create', name: 'CrossFit Vida Ativa' }, H), env })).json();
  assert.equal(again.slug, 'crossfit-vida-ativa-2', 'endereço repetido ganha número');
  const cfg = await (await aConfig.onRequestGet({ request: R('/c', { headers: adm(vida) }), env })).json();
  assert.equal(cfg.event_name, 'CrossFit Vida Ativa'); assert.equal(cfg.presale_price_cents, 4500, 'preço copiado'); assert.deepEqual(cfg.tiers, [{ n: 1, cents: 2000 }]);
  assert.equal(cfg.published_at, '', 'data de publicação NÃO copiada');
  const list = (await (await aEvents.onRequestGet({ request: R('/e', { headers: H }), env })).json()).events;
  assert.deepEqual(list.map((e) => e.slug), ['principal', 'crossfit-vida-ativa', 'crossfit-vida-ativa-2']);
});

test('cada evento tem seus atletas, fotos e configuração; o principal responde sem ?e=', async () => {
  await aAth.onRequestPost({ request: P('/a', { action: 'bulk', text: 'Ana Souza, RX\nBruno Lima\nCarla Dias; INT' }, adm(vida)), env });
  const a = async (slug) => (await (await event.onRequestGet({ request: R('/api/event' + (slug ? '?e=' + slug : '')), env })).json());
  const v = await a('crossfit-vida-ativa'), m = await a('');
  assert.equal(v.athletes.length, 3); assert.equal(v.eventName, 'CrossFit Vida Ativa'); assert.equal(v.slug, 'crossfit-vida-ativa');
  assert.equal(m.athletes.length, 38); assert.equal(m.slug, 'principal'); assert.equal(m.isMain, true);
  assert.equal((await event.onRequestGet({ request: R('/api/event?e=nao-existe'), env })).status, 404);
  // preço independente
  await aConfig.onRequestPost({ request: P('/c', { presale_price_cents: '3000' }, adm(vida)), env });
  assert.equal((await a('crossfit-vida-ativa')).allPrice, 3000); assert.equal((await a('')).allPrice, 4500);
  // fotos separadas por evento
  const up = async (ev, name, ids = [], geral = true) => {
    const { id } = await (await aPhoto.onRequestPost({ request: P('/p', { filename: name, athleteIds: ids, geral }, adm(ev)), env })).json();
    for (const k of ['orig', 'prev']) await aPhotoPut.onRequestPut({ params: { id, kind: k }, request: R('/x', { method: 'PUT', headers: adm(ev), body: new Uint8Array([1, 2, 3]) }), env });
    return id;
  };
  const fv = await up(vida, 'v1.jpg'), fm = await up(1, 'm1.jpg');
  const ph = async (q) => (await (await photosApi.onRequestGet({ request: R('/api/photos' + q), env })).json()).photos;
  assert.deepEqual(await ph('?e=crossfit-vida-ativa'), [fv]); assert.deepEqual(await ph(''), [fm]);
  // atleta de outro evento não vale
  const athV = v.athletes[0].id;
  assert.equal((await aPhoto.onRequestPost({ request: P('/p', { filename: 'x.jpg', athleteIds: [m.athletes[0].id] }, adm(vida)), env })).status, 400, 'atleta do principal não entra em foto do Vida Ativa');
  const adminCounts = await (await aPhotos.onRequestGet({ request: R('/a', { headers: adm(vida) }), env })).json();
  assert.equal(adminCounts.total, 1); assert.equal(adminCounts.athletes.length, 3);
});

test('compra no evento novo usa os atletas, preço e nome dele; atleta do outro evento é recusado; e-mail traz o nome certo', async () => {
  const v = await (await event.onRequestGet({ request: R('/api/event?e=crossfit-vida-ativa'), env })).json();
  const body = { name: 'Rui', whatsapp: '27933332222', email: 'rui@b.com', pin: '1234' };
  const m = await (await event.onRequestGet({ request: R('/api/event'), env })).json();
  assert.equal((await presale.onRequestPost({ request: P('/p', { ...body, athleteId: m.athletes[0].id, e: 'crossfit-vida-ativa' }), env })).status, 400, 'atleta de outro evento');
  const ok = await presale.onRequestPost({ request: P('/p', { ...body, athleteId: v.athletes[0].id, e: 'crossfit-vida-ativa' }), env });
  assert.equal(ok.status, 200); assert.equal(pref.items[0].unit_price, 30, 'preço do Vida Ativa'); assert.match(pref.items[0].title, /CrossFit Vida Ativa/);
  const { token } = await ok.json();
  await webhook.onRequestPost({ request: R('/w?type=payment&data.id=1', { method: 'POST', body: '{}' }), env });
  const ped = await (await pedido.onRequestGet({ params: { token }, request: R('/x'), env })).json();
  assert.equal(ped.status, 'pago'); assert.equal(ped.eventSlug, 'crossfit-vida-ativa'); assert.equal(ped.eventName, 'CrossFit Vida Ativa');
  assert.match(mails.at(-1).subject, /CrossFit Vida Ativa/, 'e-mail com o nome do evento certo');
  const acc = await (await acesso.onRequestPost({ request: P('/a', { whatsapp: '27933332222', pin: '1234' }), env })).json();
  assert.equal(acc.orders[0].eventName, 'CrossFit Vida Ativa');
  // pedidos aparecem só no painel do evento certo
  const ord = async (ev) => (await (await aOrders.onRequestGet({ request: R('/o', { headers: adm(ev) }), env })).json()).orders;
  assert.equal((await ord(vida)).length, 1); assert.equal((await ord(1)).length, 0);
  // fotos avulsas: foto de outro evento é recusada
  const fm = (await (await photosApi.onRequestGet({ request: R('/api/photos'), env })).json()).photos[0];
  assert.equal((await checkout.onRequestPost({ request: P('/c', { ...body, photoIds: [fm], e: 'crossfit-vida-ativa' }), env })).status, 400);
});

test('pacote completo só libera fotos do próprio evento', async () => {
  const v = await (await event.onRequestGet({ request: R('/api/event?e=crossfit-vida-ativa'), env })).json();
  const { token } = await (await presale.onRequestPost({ request: P('/p', { name: 'Lia', whatsapp: '27911110000', email: 'l@b.com', pin: '4321', athleteId: v.athletes[1].id, e: 'crossfit-vida-ativa' }), env })).json();
  await webhook.onRequestPost({ request: R('/w?type=payment&data.id=1', { method: 'POST', body: '{}' }), env });
  const up = async (ev, ids) => { const { id } = await (await aPhoto.onRequestPost({ request: P('/p', { filename: 'z.jpg', athleteIds: ids }, adm(ev)), env })).json();
    for (const k of ['orig', 'prev']) await aPhotoPut.onRequestPut({ params: { id, kind: k }, request: R('/x', { method: 'PUT', headers: adm(ev), body: new Uint8Array([9]) }), env }); return id; };
  const mine = await up(vida, [v.athletes[1].id]);
  assert.deepEqual((await (await pedido.onRequestGet({ params: { token }, request: R('/x'), env })).json()).photos.map((p) => p.id), [mine]);
});

test('arquivar bloqueia vendas; trocar o principal; endereço do principal fixo', async () => {
  const v = await (await event.onRequestGet({ request: R('/api/event?e=crossfit-vida-ativa'), env })).json();
  await aEvents.onRequestPost({ request: P('/e', { action: 'archive', id: vida, archived: true }, H), env });
  assert.equal((await (await event.onRequestGet({ request: R('/api/event?e=crossfit-vida-ativa'), env })).json()).salesClosed, true);
  assert.equal((await presale.onRequestPost({ request: P('/p', { name: 'Zé', whatsapp: '27900001111', email: 'z@b.com', pin: '1234', athleteId: v.athletes[0].id, e: 'crossfit-vida-ativa' }), env })).status, 410);
  assert.equal((await aEvents.onRequestPost({ request: P('/e', { action: 'archive', id: 1, archived: true }, H), env })).status, 400, 'principal não arquiva');
  assert.equal((await aEvents.onRequestPost({ request: P('/e', { action: 'update', id: 1, slug: 'outro' }, H), env })).status, 200);
  assert.equal((await eventBySlug(env, 'principal')).slug, 'principal', 'slug do principal não muda');
  await aEvents.onRequestPost({ request: P('/e', { action: 'main', id: vida }, H), env });
  assert.equal((await (await event.onRequestGet({ request: R('/api/event'), env })).json()).slug, 'crossfit-vida-ativa', 'sem ?e= abre o novo principal');
  assert.equal((await aEvents.onRequestPost({ request: P('/e', { action: 'update', id: 1, name: 'Campeonato' }, H), env })).status, 200);
});
