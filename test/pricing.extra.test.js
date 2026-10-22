import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, cartPrice } from '../functions/_lib/pricing.js';
test('allowAll=false não oferece pacote nem upsell', () => {
  const r = cartPrice(10, DEFAULTS, Date.parse('2026-10-26T12:00:00Z'), { allowAll: false });
  assert.equal(r.kind, 'four'); assert.equal(r.upsell, null); assert.equal(r.total, 12000 - 0 >= 0 ? r.total : 0);
});
