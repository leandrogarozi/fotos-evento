import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, cartPrice } from '../functions/_lib/pricing.js';
test('allowAll=false não oferece pacote nem upsell', () => {
  const r = cartPrice(10, DEFAULTS, Date.parse('2026-10-26T12:00:00Z'), { allowAll: false });
  assert.equal(r.upsell, null); assert.equal(r.total, 11000, '10 fotos: 2 pacotes de 4 + 2 avulsas');
});

import { normalizeTiers, parseTiers } from '../functions/_lib/pricing.js';
const T = (tiers) => ({ ...DEFAULTS, price_tiers: JSON.stringify(tiers) });
const EVENTO = Date.parse('2026-10-26T12:00:00Z');

test('pacotes configuráveis: 1 foto 15, 2 fotos 30, 3 fotos 40, 10 fotos 90', () => {
  const cfg = T([{ n: 1, cents: 1500 }, { n: 2, cents: 3000 }, { n: 3, cents: 4000 }, { n: 10, cents: 9000 }]);
  const q = (n) => cartPrice(n, { ...cfg, price_all_event_cents: 99900 }, EVENTO);
  assert.equal(q(1).total, 1500); assert.equal(q(2).total, 3000);
  assert.equal(q(3).total, 4000);
  assert.equal(q(4).total, 5500, '3 + 1 avulsa');
  assert.equal(q(6).total, 8000, '3 + 3');
  assert.equal(q(9).total, 9000, 'o pacote de 10 é mais barato que 9 fotos e ainda sobra 1');
  assert.equal(q(9).freeExtra, 1);
  assert.equal(q(11).total, 10500, '10 + 1');
});

test('pacote vira o único se só houver um; sem pacote válido cai nos preços antigos', () => {
  assert.equal(cartPrice(2, T([{ n: 2, cents: 3000 }]), EVENTO, { allowAll: false }).total, 3000);
  assert.equal(cartPrice(3, T([{ n: 2, cents: 3000 }]), EVENTO, { allowAll: false }).total, 6000, '3 fotos exigem 2 pacotes de 2');
  assert.deepEqual(parseTiers({ ...DEFAULTS, price_tiers: 'lixo' }), [{ n: 1, cents: 1500 }, { n: 4, cents: 4000 }]);
  assert.deepEqual(parseTiers(DEFAULTS), [{ n: 1, cents: 1500 }, { n: 4, cents: 4000 }]);
});

test('limpeza dos pacotes: ordena, tira inválidos e repetidos', () => {
  assert.deepEqual(normalizeTiers([{ n: 4, cents: 4000 }, { n: 1, cents: 1500 }, { n: 4, cents: 3900 }, { n: 0, cents: 100 }, { n: 2, cents: 50 }, { n: 500, cents: 9000 }, { n: 'x', cents: 9 }]),
    [{ n: 1, cents: 1500 }, { n: 4, cents: 3900 }]);
  assert.equal(normalizeTiers([]), null); assert.equal(normalizeTiers('x'), null);
});
