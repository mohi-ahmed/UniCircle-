import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { app } from '../src/app.js';
import { ApiError } from '../src/lib/http.js';
import { normalizeDomain } from '../src/services/admin.js';

test('admin domain normalization accepts exact domains and rejects lookalikes or URLs', () => {
  assert.equal(normalizeDomain(' SEU.EDU.BD '), 'seu.edu.bd');
  assert.equal(normalizeDomain('mail.seu.edu.bd'), 'mail.seu.edu.bd');
  assert.throws(() => normalizeDomain('https://seu.edu.bd'), ApiError);
  assert.throws(() => normalizeDomain('*.seu.edu.bd'), ApiError);
  assert.throws(() => normalizeDomain('member@seu.edu.bd'), ApiError);
  assert.throws(() => normalizeDomain('evilseu.edu.bd/path'), ApiError);
});

test('admin APIs reject visitors before accessing persistence', async (context) => {
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  context.after(() => server.close()); const address = server.address(); assert.ok(address && typeof address === 'object');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/admin/domains`);
  assert.equal(response.status, 401);
});
