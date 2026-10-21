import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, cartPrice, allPrice } from '../functions/_lib/pricing.js';

const PRE = Date.parse('2026-10-22T12:00:00Z');
const EVENT = Date.parse('2026-10-26T12:00:00Z');
const cfg = { ...DEFAULTS };

test('carrinho depois da pré-venda (todas = 60)', () => {
  const t = (n) => cartPrice(n, cfg, EVENT);
  assert.equal(t(1).total, 1500);
  assert.equal(t(2).total, 3000);
  assert.equal(t(3).total, 4000);
  assert.equal(t(3).freeExtra, 1);
  assert.equal(t(4).total, 4000);
  assert.equal(t(5).total, 5500);
  assert.equal(t(5).upsell.price, 6000);
  assert.equal(t(6).total, 6000);
  assert.equal(t(6).kind, 'all');
  assert.equal(t(2).upsell.extra, 3000);
  assert.equal(t(1).upsell, null);
});

test('na pré-venda 5+ já cai no pacote de 50', () => {
  assert.equal(cartPrice(5, cfg, PRE).total, 5000);
  assert.equal(cartPrice(5, cfg, PRE).kind, 'all');
  assert.equal(cartPrice(4, cfg, PRE).total, 4000);
});

test('preço do pacote muda com o tempo', () => {
  assert.equal(allPrice(cfg, PRE), 5000);
  assert.equal(allPrice(cfg, EVENT), 6000);
  const pub = { ...cfg, published_at: '2026-10-26T00:00:00Z' };
  assert.equal(allPrice(pub, Date.parse('2026-10-30T00:00:00Z')), 6000);
  assert.equal(allPrice(pub, Date.parse('2026-11-01T00:00:00Z')), 8000);
});
