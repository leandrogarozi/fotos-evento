import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDB, makeR2 } from './helpers.js';
import * as storage from '../functions/api/admin/storage.js';
import * as login from '../functions/api/admin/login.js';

const env = { DB: makeDB(), FOTOS: makeR2(), ADMIN_PASSWORD: 'segredo' };
const req = (path, init) => new Request('https://fotos.test' + path, init);
test('mede o espaço usado, por evento, e acha sobras sem foto no banco', async () => {
  const { token } = await (await login.onRequestPost({ request: req('/l', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'segredo' }) }), env })).json();
  const H = { authorization: 'Bearer ' + token };
  assert.equal((await storage.onRequestGet({ request: req('/s'), env })).status, 401);
  await env.DB.prepare("INSERT INTO photos (id, filename, has_orig, has_prev, created_at, event_id) VALUES ('a1', 'a.jpg', 1, 1, 'x', 1)").run();
  await env.FOTOS.put('orig/a1', new Uint8Array(1000)); await env.FOTOS.put('prev/a1', new Uint8Array(200));
  await env.FOTOS.put('orig/sobra', new Uint8Array(500)); // arquivo sem foto no banco
  const r = await (await storage.onRequestGet({ request: req('/s', { headers: H }), env })).json();
  assert.equal(r.used, 1700); assert.equal(r.originals.bytes, 1500); assert.equal(r.previews.bytes, 200);
  assert.equal(r.byEvent[0].photos, 1); assert.equal(r.byEvent[0].bytes, 1200);
  assert.deepEqual(r.orphan, { files: 1, bytes: 500 });
  assert.equal(r.limit, 10e9);
  await env.FOTOS.delete('orig/a1'); await env.FOTOS.delete('prev/a1');
  const r2 = await (await storage.onRequestGet({ request: req('/s', { headers: H }), env })).json();
  assert.equal(r2.used, 500, 'depois de apagar, o uso diminui');
});

test('retomar envio: lista de nomes com atletas; limpeza de envios pela metade', async () => {
  const photosApi = await import('../functions/api/admin/photos.js');
  const { token } = await (await login.onRequestPost({ request: req('/l', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: 'segredo' }) }), env })).json();
  const H = { authorization: 'Bearer ' + token };
  await env.DB.prepare("INSERT INTO photos (id, filename, has_orig, has_prev, created_at) VALUES ('p1', 'IMG_1.jpg', 1, 1, 'x'), ('p2', 'IMG_2.jpg', 1, 1, 'x')").run();
  await env.DB.prepare("INSERT INTO photo_athletes (photo_id, athlete_id) VALUES ('p1', 1), ('p1', 2)").run();
  const r = await (await photosApi.onRequestGet({ request: req('/a?names=1', { headers: H }), env })).json();
  const byId = Object.fromEntries(r.names.map((n) => [n.id, n]));
  assert.deepEqual(byId.p1.aths.sort(), [1, 2]); assert.deepEqual(byId.p2.aths, []); assert.equal(byId.p1.filename, 'IMG_1.jpg');
  // foto pela metade (sem original), antiga, com arquivo da vitrine solto
  await env.DB.prepare("INSERT INTO photos (id, filename, has_orig, has_prev, created_at) VALUES ('meia', 'M.jpg', 0, 1, '2020-01-01T00:00:00Z')").run();
  await env.FOTOS.put('prev/meia', new Uint8Array(300));
  const c = await (await storage.onRequestPost({ request: req('/s', { method: 'POST', headers: { ...H, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'limpar' }) }), env })).json();
  assert.equal(c.halfDone, 1);
  assert.equal(await env.DB.prepare("SELECT id FROM photos WHERE id = 'meia'").first(), null);
  assert.equal(env.FOTOS.store.has('prev/meia'), false);
  assert.ok(await env.DB.prepare("SELECT id FROM photos WHERE id = 'p1'").first(), 'foto completa fica');
});
