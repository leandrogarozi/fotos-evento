import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDB, makeR2 } from './helpers.js';
import * as fav from '../functions/api/favoritas.js';

const env = { DB: makeDB(), FOTOS: makeR2() };
const post = (body) => fav.onRequestPost({ request: new Request('https://f.test/api/favoritas', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }), env });
const photo = (id, ev = 1) => env.DB.prepare("INSERT INTO photos (id, filename, has_orig, has_prev, created_at, event_id) VALUES (?, ?, 1, 1, 'x', ?)").bind(id, id, ev).run();
const who = { name: 'Maria', whatsapp: '(27) 99999-1234', pin: '1234' };

test('salvar, abrir em outro aparelho, sincronizar e proteger com senha', async () => {
  for (const id of ['f1', 'f2', 'f3']) await photo(id);
  await photo('x9', 2); // foto de outro evento nunca entra
  let r = await post({ action: 'salvar', ...who, ids: ['f1', 'f2', 'x9', 'inexistente'] });
  assert.equal(r.status, 200); const s = await r.json(); assert.equal(s.saved, 2); assert.ok(s.token);
  // outro aparelho: abre com WhatsApp (formato diferente) + senha
  r = await post({ action: 'abrir', whatsapp: '27999991234', pin: '1234' });
  const o = await r.json(); assert.deepEqual(o.ids.sort(), ['f1', 'f2']); assert.equal(o.name, 'Maria');
  // sincronizar com o token
  assert.equal((await post({ action: 'sincronizar', token: o.token, ids: ['f1', 'f2', 'f3'] })).status, 200);
  assert.deepEqual((await (await post({ action: 'abrir', whatsapp: '27999991234', pin: '1234' })).json()).ids.sort(), ['f1', 'f2', 'f3']);
  assert.equal((await post({ action: 'sincronizar', token: 'errado', ids: ['f1'] })).status, 404);
  // salvar de novo com a mesma senha atualiza; com senha errada não deixa
  assert.equal((await post({ action: 'salvar', ...who, ids: ['f3'] })).status, 200);
  assert.equal((await post({ action: 'salvar', ...who, pin: '9999', ids: ['f1'] })).status, 401);
  // 5 erros bloqueiam
  for (let i = 0; i < 4; i++) await post({ action: 'abrir', whatsapp: '27999991234', pin: '0000' });
  assert.equal((await post({ action: 'abrir', whatsapp: '27999991234', pin: '1234' })).status, 429);
});
test('sem favoritas e dados inválidos', async () => {
  assert.equal((await post({ action: 'abrir', whatsapp: '27888887777', pin: '1234' })).status, 404);
  assert.equal((await post({ action: 'salvar', name: 'A', whatsapp: '27888887777', pin: '12', ids: [] })).status, 400);
  assert.equal((await post({ action: 'salvar', name: '', whatsapp: '27888887777', pin: '1234', ids: [] })).status, 400);
  assert.equal((await post({ e: 'nao-existe', action: 'abrir', whatsapp: '27888887777', pin: '1234' })).status, 404);
});
