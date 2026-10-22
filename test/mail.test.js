import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDB, makeR2 } from './helpers.js';
import * as presale from '../functions/api/presale.js';
import * as checkout from '../functions/api/checkout.js';
import * as webhook from '../functions/api/webhook/mercadopago.js';
import * as pedido from '../functions/api/pedido/[token].js';
import * as login from '../functions/api/admin/login.js';
import * as aOrders from '../functions/api/admin/orders.js';
import { encryptPin, decryptPin } from '../functions/_lib/secret.js';

const env = { DB: makeDB(), FOTOS: makeR2(), MP_ACCESS_TOKEN: 'TEST', ADMIN_PASSWORD: 'segredo', MAIL_WEBHOOK_URL: 'https://script.test/exec', MAIL_WEBHOOK_SECRET: 's3' };
const req = (path, init) => new Request('https://fotos.test' + path, init);
const post = (path, body, headers = {}) => req(path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
let lastPref; const payments = {}; let mails = []; let mailOk = true;
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url === 'https://script.test/exec') { mails.push(JSON.parse(init.body)); return new Response(JSON.stringify({ ok: mailOk }), { status: 200 }); }
  if (url.endsWith('/checkout/preferences')) { lastPref = JSON.parse(init.body); return new Response(JSON.stringify({ init_point: 'https://mp.test/x' }), { status: 201 }); }
  if (url.includes('/v1/payments/search')) return new Response(JSON.stringify({ results: Object.values(payments).filter((p) => p.external_reference === new URL(url).searchParams.get('external_reference')) }));
  const m = url.match(/\/v1\/payments\/(\w+)$/);
  return m && payments[m[1]] ? new Response(JSON.stringify(payments[m[1]])) : new Response('{}', { status: 404 });
};
const buy = async (extra = {}) => (await (await presale.onRequestPost({ request: post('/p', { athleteId: 1, name: 'Maria Silva', whatsapp: '27999991234', email: 'maria@exemplo.com', pin: '4321', ...extra }), env })).json());
const pay = (id) => { payments[id] = { id, status: 'approved', transaction_amount: 50, external_reference: lastPref.external_reference }; return webhook.onRequestPost({ request: post(`/w?type=payment&data.id=${id}`, {}), env }); };
const row = () => env.DB.prepare('SELECT pin_enc, status FROM orders ORDER BY created_at DESC').first();

test('cifra e decifra a senha; texto cifrado não revela a senha', async () => {
  const c = await encryptPin(env, '4321');
  assert.ok(!c.includes('4321')); assert.equal(await decryptPin(env, c), '4321');
  assert.equal(await decryptPin({ ADMIN_PASSWORD: 'outra' }, c), null);
});

test('e-mail passa a ser obrigatório', async () => {
  for (const email of ['', 'sem-arroba']) assert.equal((await presale.onRequestPost({ request: post('/p', { athleteId: 1, name: 'M', whatsapp: '27999991234', email, pin: '4321' }), env })).status, 400);
});

test('antes de pagar não manda e-mail; o texto cifrado fica guardado', async () => {
  await buy();
  assert.equal(mails.length, 0);
  const r = await row(); assert.ok(r.pin_enc && !r.pin_enc.includes('4321'));
});

test('ao confirmar o pagamento: 1 e-mail com senha e link; guarda zerada; reentrega não duplica', async () => {
  await pay(1);
  assert.equal(mails.length, 1);
  const m = mails[0];
  assert.equal(m.to, 'maria@exemplo.com'); assert.equal(m.secret, 's3');
  assert.match(m.subject, /Pagamento confirmado/);
  assert.ok(m.text.includes('4321') && m.text.includes('https://fotos.test/') && m.text.includes('Já comprei'));
  assert.ok(m.html.includes('4321') && m.html.includes('href="https://fotos.test/"'));
  assert.ok(!/—/.test(m.text), 'sem travessão');
  assert.equal((await row()).pin_enc, '');
  await pay(1); await pay(2);
  assert.equal(mails.length, 1, 'webhook repetido não reenvia');
});

test('se o e-mail falhar, a compra segue paga e a senha cifrada fica para o reenvio', async () => {
  mails = []; mailOk = false;
  await buy({ pin: '7777', email: 'joao@exemplo.com', name: 'João' });
  const r = await pay(3);
  assert.equal(r.status, 200);
  assert.equal(mails.length, 1);
  const x = await row(); assert.equal(x.status, 'pago'); assert.ok(x.pin_enc.length > 10);
  mailOk = true;
});

test('sem MAIL_WEBHOOK_URL o fluxo não quebra', async () => {
  const env2 = { ...env, MAIL_WEBHOOK_URL: undefined };
  const t = await (await presale.onRequestPost({ request: post('/p', { athleteId: 2, name: 'Ana', whatsapp: '27988887777', email: 'ana@exemplo.com', pin: '1111' }), env: env2 })).json();
  payments[9] = { id: 9, status: 'approved', transaction_amount: 50, external_reference: lastPref.external_reference };
  const r = await webhook.onRequestPost({ request: post('/w?type=payment&data.id=9', {}), env: env2 });
  assert.equal(r.status, 200);
  assert.equal((await (await pedido.onRequestGet({ params: { token: t.token }, request: req('/x'), env: env2 })).json()).status, 'pago');
});

test('painel: trocar a senha de pedido pago manda o e-mail novo', async () => {
  mails = [];
  const { token } = await (await login.onRequestPost({ request: post('/l', { password: 'segredo' }), env })).json();
  const H = { authorization: 'Bearer ' + token };
  const list = await (await aOrders.onRequestGet({ request: req('/o', { headers: H }), env })).json();
  const paid = list.orders.find((o) => o.buyer_name === 'Maria Silva');
  const r = await (await aOrders.onRequestPost({ request: post('/o', { id: paid.id, action: 'senha', pin: '8888' }, H), env })).json();
  assert.equal(r.emailed, true);
  assert.equal(mails.length, 1); assert.ok(mails[0].text.includes('8888'));
});

test('compra pela loja também exige e-mail', async () => {
  const r = await checkout.onRequestPost({ request: post('/c', { athleteId: 1, all: true, name: 'Rui', whatsapp: '27966665555', pin: '1234' }), env });
  assert.equal(r.status, 400);
});

test('painel: excluir pedido e trocar o atleta do pedido', async () => {
  const { token } = await (await login.onRequestPost({ request: post('/l', { password: 'segredo' }), env })).json();
  const H = { authorization: 'Bearer ' + token };
  const list = async () => (await (await aOrders.onRequestGet({ request: req('/o', { headers: H }), env })).json()).orders;
  const antes = await list(); const alvo = antes[0];
  assert.equal((await aOrders.onRequestPost({ request: post('/o', { id: alvo.id, action: 'atleta', athleteId: 99999 }, H), env })).status, 400);
  assert.equal((await aOrders.onRequestPost({ request: post('/o', { id: alvo.id, action: 'atleta', athleteId: 5 }, H), env })).status, 200);
  assert.equal((await list()).find((o) => o.id === alvo.id).athlete_name, 'Donovan Cardoso');
  assert.equal((await aOrders.onRequestPost({ request: post('/o', { id: alvo.id, action: 'excluir' }, H), env })).status, 409, 'pedido pago exige confirmação');
  await aOrders.onRequestPost({ request: post('/o', { id: alvo.id, action: 'excluir', force: true }, H), env });
  assert.equal((await list()).length, antes.length - 1);
  assert.equal((await aOrders.onRequestPost({ request: post('/o', { id: alvo.id, action: 'excluir' }, H), env })).status, 404);
});

test('painel: reenviar e-mail com senha corrigindo o e-mail (gera nova senha quando a antiga já foi enviada e apagada)', async () => {
  mails = []; mailOk = true;
  const { token } = await (await login.onRequestPost({ request: post('/l', { password: 'segredo' }), env })).json();
  const H = { authorization: 'Bearer ' + token };
  const t = await buy({ name: 'Luiza Prado', email: 'errado@exemplo.com', whatsapp: '27955550000', pin: '2468', athleteId: 3 });
  await pay(30); assert.equal(mails.length, 1);
  assert.equal((await row()).pin_enc, '', 'e-mail original saiu e a senha foi apagada');
  const lista = async () => (await (await aOrders.onRequestGet({ request: req('/o', { headers: H }), env })).json()).orders;
  const o = (await lista()).find((x) => x.buyer_name === 'Luiza Prado');
  const re = (b) => aOrders.onRequestPost({ request: post('/o', { id: o.id, action: 'reenviar', ...b }, H), env });
  assert.equal((await re({ email: 'sem-arroba' })).status, 400);
  mails = [];
  const r = await (await re({ email: 'certo@exemplo.com' })).json();
  assert.equal(r.emailed, true); assert.equal(r.novaSenha, true); assert.match(r.pin, /^\d{6}$/);
  assert.equal(mails.length, 1); assert.equal(mails[0].to, 'certo@exemplo.com'); assert.ok(mails[0].text.includes(r.pin));
  assert.equal((await lista()).find((x) => x.id === o.id).email, 'certo@exemplo.com', 'e-mail corrigido no pedido');
  const acc = (pin) => import('../functions/api/acesso.js').then((m) => m.onRequestPost({ request: post('/a', { whatsapp: '27955550000', pin }), env }));
  assert.equal((await acc('2468')).status, 401, 'a senha antiga deixa de valer'); assert.equal((await acc(r.pin)).status, 200, 'a nova funciona');
});

test('reenviar: se o e-mail original falhou, reenvia a MESMA senha; se o envio falhar, devolve a senha para o WhatsApp; só pedido pago', async () => {
  mails = []; mailOk = false;
  const { token } = await (await login.onRequestPost({ request: post('/l', { password: 'segredo' }), env })).json();
  const H = { authorization: 'Bearer ' + token };
  const t = await buy({ name: 'Caio Nunes', email: 'caio@exemplo.com', whatsapp: '27944441111', pin: '1357', athleteId: 4 });
  await pay(31);
  assert.ok((await row()).pin_enc.length > 10, 'e-mail falhou: senha cifrada segue guardada');
  const lista = async () => (await (await aOrders.onRequestGet({ request: req('/o', { headers: H }), env })).json()).orders;
  const o = (await lista()).find((x) => x.buyer_name === 'Caio Nunes');
  const re = () => aOrders.onRequestPost({ request: post('/o', { id: o.id, action: 'reenviar', email: 'caio@exemplo.com' }, H), env });
  let r = await (await re()).json();
  assert.equal(r.emailed, false); assert.equal(r.pin, '1357'); assert.equal(r.novaSenha, false, 'mesma senha que ele criou');
  mailOk = true; mails = [];
  r = await (await re()).json();
  assert.equal(r.emailed, true); assert.equal(r.pin, '1357'); assert.ok(mails[0].text.includes('1357'));
  assert.equal((await row()).pin_enc, '', 'depois de enviar, apaga');
  // pedido ainda não pago
  const p2 = await buy({ name: 'Rita Lopes', email: 'rita@exemplo.com', whatsapp: '27933332222', pin: '8642', athleteId: 5 });
  const o2 = (await lista()).find((x) => x.buyer_name === 'Rita Lopes');
  assert.equal((await aOrders.onRequestPost({ request: post('/o', { id: o2.id, action: 'reenviar', email: 'rita@exemplo.com' }, H), env })).status, 409);
});
