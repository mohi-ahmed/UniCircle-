import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { app } from '../src/app.js';
import { guestCsrfCookieValue } from '../src/lib/http.js';
import { disconnectDatabase } from '../src/lib/mongo.js';
import { hashPassword, safeEqual, verifyPassword } from '../src/lib/security.js';
import { normalizeEmail } from '../src/services/auth.js';

test('email normalization extracts the exact lower-case domain', () => {
  assert.deepEqual(normalizeEmail(' Member@SEU.EDU.BD '), { email: 'member@seu.edu.bd', domain: 'seu.edu.bd' });
  assert.equal(normalizeEmail('member@evilseu.edu.bd').domain, 'evilseu.edu.bd');
});

test('password hashes use a verifiable Argon2id value', async () => {
  const hash = await hashPassword('ExamplePass123!');
  assert.match(hash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(hash, 'ExamplePass123!'), true);
  assert.equal(await verifyPassword(hash, 'wrong password'), false);
});

test('signed guest CSRF value binds the returned token', () => {
  const signed = guestCsrfCookieValue('sample-token');
  const [token] = signed.split('.');
  assert.equal(safeEqual(token ?? '', 'sample-token'), true);
  assert.notEqual(signed, guestCsrfCookieValue('different-token'));
});

test('GET /api/v1/auth/csrf returns contract envelope and signed cookie', async (context) => {
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(async () => {
    server.close();
    await disconnectDatabase();
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const response = await fetch(`http://127.0.0.1:${address.port}/api/v1/auth/csrf`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie') ?? '', /^uc_guest_csrf=/);
  const payload = await response.json() as { data: { csrfToken: string } };
  assert.ok(payload.data.csrfToken.length >= 32);
});
