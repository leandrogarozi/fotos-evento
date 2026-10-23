// Busca por rosto: só números trafegam; vetores quantizados; separação por evento.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDB, makeR2 } from './helpers.js';
import * as rosto from '../functions/api/rosto.js';
import * as faces from '../functions/api/admin/photo/[id]/faces.js';
import * as aPhotos from '../functions/api/admin/photos.js';
import * as login from '../functions/api/admin/login.js';
import * as event from '../functions/api/event.js';
import { packVec, unpackVec, dist } from '../functions/_lib/faces.js';

const env = { DB: makeDB(), FOTOS: makeR2(), ADMIN_PASSWORD: 'segredo' };
const req = (path, init) => new Request('https://fotos.test' + path, init);
const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5;
const vec = () => Array.from({ length: 128 }, () => rnd() * 0.3);
const near = (v, eps) => v.map((x) => x + (rnd() * eps));
const A = vec(), B = vec();
const photo = (id, event_id = 1, ready = 1) => env.DB.prepare("INSERT INTO photos (id, filename, has_orig, has_prev, created_at, event_id) VALUES (?, ?, ?, ?, 'x', ?)").bind(id, id + '.jpg', ready, ready, event_id).run();
let H;

test('empacotar e desempacotar mantém a distância (erro pequeno)', () => {
  const a = vec(), b = near(a, 0.04);
  const d1 = dist(Float32Array.from(a), Float32Array.from(b)), d2 = dist(unpackVec(packVec(a)), unpackVec(packVec(b)));
  assert.ok(Math.abs(d1 - d2) < 0.03, `${d1} x ${d2}`);
});

test('painel grava rostos; só admin; vira lista de pendentes', async () => {
  const { token } = await (await login.onRequestPost({ request: post('/l', { password: 'segredo' }), env })).json();
  H = { authorization: 'Bearer ' + token };
  await photo('11111111-1111-1111-1111-111111111111'); await photo('22222222-2222-2222-2222-222222222222'); await photo('33333333-3333-3333-3333-333333333333');
  await photo('44444444-4444-4444-4444-444444444444', 1, 0); await photo('55555555-5555-5555-5555-555555555555', 2);
  const put = (id, f, h = H) => faces.onRequestPost({ params: { id }, request: post('/f', { faces: f }, h), env });
  assert.equal((await put('11111111-1111-1111-1111-111111111111', [A], {})).status, 401);
  assert.equal((await put('11111111-1111-1111-1111-111111111111', [near(A, 0.02), B])).status, 200); // foto com 2 rostos
  assert.equal((await put('22222222-2222-2222-2222-222222222222', [B])).status, 200);
  assert.equal((await put('33333333-3333-3333-3333-333333333333', [])).status, 200); // sem rosto, mas processada
  assert.equal((await put('44444444-4444-4444-4444-444444444444', [A])).status, 200); // incompleta (sem vitrine)
  assert.equal((await put('55555555-5555-5555-5555-555555555555', [near(A, 0.02)])).status, 200); // outro evento
  assert.equal((await put('11111111-1111-1111-1111-111111111111', [[1, 2, 3]])).status, 400, 'vetor inválido');
  const l = await (await aPhotos.onRequestGet({ request: req('/a?pendingFaces=1', { headers: H }), env })).json();
  assert.equal(l.facesPending, 0);
  await photo('66666666-6666-6666-6666-666666666666');
  const l2 = await (await aPhotos.onRequestGet({ request: req('/a?pendingFaces=1', { headers: H }), env })).json();
  assert.deepEqual(l2.pendingIds, ['66666666-6666-6666-6666-666666666666']);
});

test('busca: acha as fotos do rosto, ignora outro evento e foto incompleta', async () => {
  const q = (d, e) => rosto.onRequestPost({ request: post('/api/rosto', { e, d }), env }).then((r) => r.json());
  const r = await q(near(A, 0.02));
  assert.deepEqual(r.ids, ['11111111-1111-1111-1111-111111111111']);
  const rb = await q(B);
  assert.deepEqual(rb.ids.sort(), ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']);
  assert.deepEqual((await q(vec())).ids, [], 'rosto desconhecido não acha nada');
  await env.DB.prepare("INSERT INTO events (id, slug, name, is_main, created_at) VALUES (2, 'outro', 'Outro', 0, 'x')").run();
  assert.deepEqual((await q(near(A, 0.02), 'outro')).ids, ['55555555-5555-5555-5555-555555555555']);
  assert.equal((await rosto.onRequestPost({ request: post('/api/rosto', { d: [1] }), env })).status, 400);
  assert.equal((await rosto.onRequestPost({ request: post('/api/rosto', { e: 'nao-existe', d: A }), env })).status, 404);
});

test('sensibilidade configurável e busca desligada por padrão na loja', async () => {
  const e = await (await event.onRequestGet({ request: req('/api/event'), env })).json();
  assert.equal(e.faceEnabled, false);
  await env.DB.prepare("INSERT OR REPLACE INTO event_config (event_id, key, value) VALUES (1, 'face_dist', '20')").run();
  const far = near(A, 0.4); // bem diferente: passa em 0,50 mas não em 0,20
  const strict = await (await rosto.onRequestPost({ request: post('/api/rosto', { d: far }), env })).json();
  assert.deepEqual(strict.ids, []);
});

test('rosto pequeno entra em "talvez", rosto grande não; largura vem do painel', async () => {
  const env2 = { DB: makeDB(), FOTOS: makeR2(), ADMIN_PASSWORD: 'segredo' };
  const { token } = await (await login.onRequestPost({ request: post('/l', { password: 'segredo' }), env: env2 })).json();
  const h = { authorization: 'Bearer ' + token };
  const add = (id) => env2.DB.prepare("INSERT INTO photos (id, filename, has_orig, has_prev, created_at) VALUES (?, ?, 1, 1, 'x')").bind(id, id + '.jpg').run();
  const ids = ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'cccccccc-cccc-cccc-cccc-cccccccccccc'];
  for (const i of ids) await add(i);
  const base = vec();
  const mid = (a, n) => a.map((x, i) => x + (i < 100 ? 0 : n)); // afasta ~ n*sqrt(28) de a
  const put = (id, f) => faces.onRequestPost({ params: { id }, request: post('/f', { faces: f }, h), env: env2 });
  const sure = base.map((x) => x + 0.01);
  const off = (w) => { const v = [...base]; for (let i = 0; i < 128; i++) v[i] += (i % 2 ? 1 : -1) * 0.0495; return { v, w }; }; // distância ~0,56: acima de 0,50
  assert.equal((await put(ids[0], [{ v: sure, w: 150 }])).status, 200);
  assert.equal((await put(ids[1], [off(30)])).status, 200); // longe e pequeno: tolerância maior
  assert.equal((await put(ids[2], [off(200)])).status, 200); // grande: 0,56 já passa de 0,50+0,05
  const r = await (await rosto.onRequestPost({ request: post('/api/rosto', { d: base }), env: env2 })).json();
  assert.deepEqual(r.ids, [ids[0]]);
  assert.deepEqual(r.maybe, [ids[1]]);
});
