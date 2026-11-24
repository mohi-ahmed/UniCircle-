import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { app } from '../src/app.js';
import { ApiError } from '../src/lib/http.js';
import { campusDate, requestTerms } from '../src/services/requests.js';

test('request snapshots validate type-specific dates, fees and exchange offers', () => {
  const now = new Date('2026-11-24T00:00:00.000Z');
  assert.equal(campusDate(now), '2026-11-24');
  assert.deepEqual(requestTerms({ listingType: 'rent', amountPoisha: 10_000, exchangeTerms: null }, {
    proposedPickupDate: '2026-11-25', returnDate: '2026-11-28',
  }, now), { proposedPickupDate: '2026-11-25', returnDate: '2026-11-28', rentalFeePoisha: 30_000, offeredItemDescription: null });
  assert.deepEqual(requestTerms({ listingType: 'exchange', amountPoisha: null, exchangeTerms: 'A lamp' }, {
    offeredItemDescription: '  A calculator  ',
  }, now), { proposedPickupDate: null, returnDate: null, rentalFeePoisha: null, offeredItemDescription: 'A calculator' });
  assert.throws(() => requestTerms({ listingType: 'rent', amountPoisha: 100, exchangeTerms: null }, {
    proposedPickupDate: '2026-11-25', returnDate: '2026-11-25',
  }, now), ApiError);
  assert.throws(() => requestTerms({ listingType: 'sell', amountPoisha: 100, exchangeTerms: null }, {
    offeredItemDescription: 'not permitted',
  }, now), ApiError);
});

test('request APIs reject visitors before accessing persistence', async (context) => {
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(() => server.close()); const address = server.address(); assert.ok(address && typeof address === 'object');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/requests/665ca7a100000000000021`);
  assert.equal(response.status, 401);
});
