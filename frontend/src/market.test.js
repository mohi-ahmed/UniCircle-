import assert from 'node:assert/strict';
import test from 'node:test';
import { DEMO_USERS, filterListings, seed, updateMarket } from './market.js';

const [member, owner, admin] = DEMO_USERS;
const stateOf = (state, id) => state.listings.find(item => item.id === id).status;

test('free filter includes donations and free borrowing without reserved or hidden listings', () => {
  const state = seed();
  assert.deepEqual(filterListings(state.listings, '', '', '', true).map(item => item.type), ['Free Borrowing', 'Donate']);
  state.listings[2].status = 'Reserved';
  state.listings[4].hidden = true;
  assert.equal(filterListings(state.listings, '', '', '', true).length, 0);
  assert.equal(filterListings(state.listings, ' calculator ', 'Electronics', 'Rent', false).length, 1);
});

test('rental validates dates, reserves one request, and reopens after return', () => {
  const id = 'item-0';
  const peer = { id: 'new-member', status: 'Verified' };
  const dates = { itemId: id, pickupDate: '2026-12-20', returnDate: '2026-12-23' };
  assert.throws(() => updateMarket(seed(), member, 'request', { ...dates, returnDate: dates.pickupDate }), /after pickup/);
  let state = updateMarket(seed(), member, 'request', dates);
  const [request] = state.requests;
  assert.equal(request.fee, 300);
  assert.throws(() => updateMarket(state, member, 'request', dates), /active request/);
  state = updateMarket(state, peer, 'request', dates);
  const accept = { requestId: request.id, point: 'Main gate', time: '2026-12-20T14:00' };
  assert.throws(() => updateMarket(state, member, 'accept', accept), /no longer available/);
  assert.throws(() => updateMarket(state, owner, 'accept', { ...accept, time: '2026-12-21T14:00' }), /proposed date/);
  state = updateMarket(state, owner, 'accept', accept);
  assert.equal(stateOf(state, id), 'Reserved');
  assert.equal(state.requests.find(entry => entry.requesterId === peer.id).status, 'Declined');
  state = updateMarket(state, owner, 'handover', accept);
  assert.equal(stateOf(state, id), 'Checked Out');
  state = updateMarket(state, owner, 'return', accept);
  assert.equal(stateOf(state, id), 'Available');
  assert.equal(state.requests.find(entry => entry.id === request.id).status, 'Completed');
});

test('editing exchange terms cancels pending requests and preserves submitted offer', () => {
  const id = 'item-3';
  let state = updateMarket(seed(), member, 'request', { itemId: id, offer: 'Badminton racket' });
  const listing = state.listings.find(item => item.id === id);
  state = updateMarket(state, owner, 'save', { itemId: id, listing: { ...listing, exchange: 'Tennis racket' } });
  assert.equal(state.requests[0].status, 'Cancelled');
  assert.equal(state.requests[0].offer, 'Badminton racket');
  assert.equal(state.requests[0].exchange, listing.exchange);
});

test('a hidden loan stays hidden after an authorized return', () => {
  const id = 'item-2';
  const dates = { itemId: id, pickupDate: '2026-12-20', returnDate: '2026-12-23' };
  let state = updateMarket(seed(), member, 'request', dates);
  const data = { requestId: state.requests[0].id, point: 'Main gate', time: '2026-12-20T14:00' };
  state = updateMarket(state, owner, 'accept', data);
  state = updateMarket(state, owner, 'handover', data);
  state = updateMarket(state, admin, 'hide', { itemId: id, reason: 'Needs moderation' });
  assert.equal(state.requests[0].status, 'Checked Out');
  state = updateMarket(state, owner, 'return', data);
  assert.equal(state.requests[0].status, 'Completed');
  assert.equal(stateOf(state, id), 'Closed');
  assert.equal(state.audit.length, 1);
});
