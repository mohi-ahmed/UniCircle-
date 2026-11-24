import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { app } from '../src/app.js';
import { ApiError } from '../src/lib/http.js';
import { parseAmount, validateListingTerms } from '../src/services/listings.js';
import { matchesMagic } from '../src/services/photos.js';

const base = { title: 'Valid listing', categoryId: '665ca7a100000000000021', description: 'A valid listing description.', condition: 'good' };

test('BDT strings convert to integer poisha without floating point', () => {
  assert.equal(parseAmount('0.01'), 1);
  assert.equal(parseAmount('9999999.99'), 999_999_999);
  assert.throws(() => parseAmount('10.1'), ApiError);
});

test('listing type terms reject mixed or non-positive terms', () => {
  assert.deepEqual(validateListingTerms({ ...base, listingType: 'sell', amountBdt: '10.00' }), { amountPoisha: 1000, exchangeTerms: null });
  assert.deepEqual(validateListingTerms({ ...base, listingType: 'exchange', exchangeTerms: 'A textbook' }), { amountPoisha: null, exchangeTerms: 'A textbook' });
  assert.throws(() => validateListingTerms({ ...base, listingType: 'rent', amountBdt: '0.00' }), ApiError);
  assert.throws(() => validateListingTerms({ ...base, listingType: 'donate', amountBdt: '1.00' }), ApiError);
});

test('photo signatures require actual JPEG, PNG or WebP magic bytes', () => {
  assert.equal(matchesMagic('image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff])), true);
  assert.equal(matchesMagic('image/png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), true);
  assert.equal(matchesMagic('image/webp', new TextEncoder().encode('RIFF0000WEBP')), true);
  assert.equal(matchesMagic('image/jpeg', new TextEncoder().encode('not an image')), false);
});

test('listing APIs reject a visitor without requiring a database connection', async (context) => {
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(() => server.close()); const address = server.address(); assert.ok(address && typeof address === 'object');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/categories`);
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: { code: 'UNAUTHENTICATED', message: 'Authentication is required.', details: {} } });
});
