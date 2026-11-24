import assert from 'node:assert/strict';
import test from 'node:test';
import { CATEGORY_SEED, INITIAL_APPROVED_DOMAIN } from '../src/constants.js';

test('Phase 1 immutable seeds match the frozen contract', () => {
  assert.equal(INITIAL_APPROVED_DOMAIN, 'seu.edu.bd');
  assert.deepEqual(CATEGORY_SEED.map(({ code }) => code), [
    'books_notes', 'electronics', 'stationery', 'lab_equipment',
    'furniture', 'clothing', 'sports', 'other',
  ]);
  assert.equal(new Set(CATEGORY_SEED.map(({ code }) => code)).size, 8);
});
