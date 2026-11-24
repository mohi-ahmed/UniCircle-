import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';

const testUri = process.env.MONGODB_TEST_URI;

test('Phase 2 auth lifecycle uses transactions, cookies, CSRF and single-use tokens', { skip: !testUri }, async (context) => {
  assert.ok(testUri);
  assert.notEqual(testUri, process.env.MONGODB_URI, 'MONGODB_TEST_URI must not be the application database URI.');
  process.env.MONGODB_URI = testUri;
  process.env.MONGODB_DB_NAME = 'UniCircle_phase2_test';
  process.env.UNIVERSITY_NAME = 'Southeast University';
  process.env.INITIAL_APPROVED_DOMAIN = 'seu.edu.bd';
  process.env.APP_BASE_URL = 'http://localhost:5173';
  process.env.ALLOWED_ORIGINS = 'http://localhost:5173';
  process.env.CSRF_SECRET = 'phase-2-integration-test-secret-value';
  process.env.NODE_ENV = 'test';

  const [{ app }, { connectDatabase, disconnectDatabase }, { runPhaseOneMigration }, models, security] = await Promise.all([
    import('../../src/app.js'), import('../../src/lib/mongo.js'), import('../../src/migrations/phase-1.js'),
    import('../../src/models/core.js'), import('../../src/lib/security.js'),
  ]);
  await connectDatabase();
  await runPhaseOneMigration();

  const collections = [models.User, models.EmailVerificationToken, models.PasswordResetToken, models.SessionRecord, models.LoginAttempt, models.EmailSendAttempt];
  await Promise.all(collections.map(model => model.deleteMany({})));

  const verificationToken = 'phase-2-verification-token-value';
  const resetToken = 'phase-2-password-reset-token-value';
  const email = 'phase2.member@seu.edu.bd';
  const originalPassword = 'OriginalPass123!';
  const newPassword = 'UpdatedPass123!';
  const user = await models.User.create({
    fullName: 'Phase Two Member', displayName: 'Phase Two', universityEmail: email,
    emailDomain: 'seu.edu.bd', passwordHash: await security.hashPassword(originalPassword),
    role: 'member', verificationStatus: 'unverified',
  });
  await models.EmailVerificationToken.create({
    userId: user._id, tokenHash: security.sha256(verificationToken),
    expiresAt: new Date(Date.now() + 60_000), usedAt: null,
  });

  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
  context.after(async () => {
    await Promise.all(collections.map(model => model.deleteMany({})));
    server.close();
    await disconnectDatabase();
  });

  async function csrf(cookie?: string) {
    const response = await fetch(`${baseUrl}/auth/csrf`, cookie ? { headers: { cookie } } : {});
    assert.equal(response.status, 200);
    const payload = await response.json() as { data: { csrfToken: string } };
    return { token: payload.data.csrfToken, cookie: cookie ?? response.headers.get('set-cookie')?.split(';')[0] ?? '' };
  }

  async function post(path: string, body: unknown, csrfToken: string, cookie: string) {
    return fetch(`${baseUrl}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:5173',
        'x-csrf-token': csrfToken, cookie }, body: JSON.stringify(body),
    });
  }

  const guest = await csrf();
  const verified = await post('/auth/verify-email', { token: verificationToken }, guest.token, guest.cookie);
  assert.equal(verified.status, 200);
  assert.equal((await models.User.findById(user._id))?.verificationStatus, 'verified');
  const reused = await post('/auth/verify-email', { token: verificationToken }, guest.token, guest.cookie);
  assert.equal(reused.status, 400);

  const login = await post('/auth/login', { universityEmail: email, password: originalPassword }, guest.token, guest.cookie);
  assert.equal(login.status, 200);
  const sessionCookie = /uc_session=([^;,]+)/.exec(login.headers.get('set-cookie') ?? '')?.[0] ?? '';
  assert.ok(sessionCookie);
  const me = await fetch(`${baseUrl}/auth/me`, { headers: { cookie: sessionCookie } });
  assert.equal(me.status, 200);
  const mePayload = await me.json() as { data: { user: { universityEmail: string } } };
  assert.equal(mePayload.data.user.universityEmail, email);

  await models.PasswordResetToken.create({
    userId: user._id, tokenHash: security.sha256(resetToken), expiresAt: new Date(Date.now() + 60_000), usedAt: null,
  });
  const resetGuest = await csrf();
  const reset = await post('/auth/reset-password', { token: resetToken, newPassword }, resetGuest.token, resetGuest.cookie);
  assert.equal(reset.status, 200);
  assert.equal(await models.SessionRecord.countDocuments({ userId: user._id }), 0);
  const revokedMe = await fetch(`${baseUrl}/auth/me`, { headers: { cookie: sessionCookie } });
  assert.equal(revokedMe.status, 401);
  const oldLogin = await post('/auth/login', { universityEmail: email, password: originalPassword }, resetGuest.token, resetGuest.cookie);
  assert.equal(oldLogin.status, 401);
  const newLogin = await post('/auth/login', { universityEmail: email, password: newPassword }, resetGuest.token, resetGuest.cookie);
  assert.equal(newLogin.status, 200);
});
