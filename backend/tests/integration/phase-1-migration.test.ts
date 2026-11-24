import assert from 'node:assert/strict';
import test from 'node:test';
import mongoose from 'mongoose';

const testUri = process.env.MONGODB_TEST_URI;

test('Phase 1 migration is idempotent on a transaction-capable test replica set', {
  skip: testUri ? false : 'MONGODB_TEST_URI is not configured',
}, async () => {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = testUri;
  process.env.MONGODB_DB_NAME = 'unicircle_phase1_test';
  process.env.UNIVERSITY_NAME = 'UniCircle Test University';
  process.env.INITIAL_APPROVED_DOMAIN = 'seu.edu.bd';

  const { resetEnvironmentForTests } = await import('../../src/config/env.js');
  const { disconnectDatabase } = await import('../../src/lib/mongo.js');
  const { runPhaseOneMigration } = await import('../../src/migrations/phase-1.js');
  resetEnvironmentForTests();

  await runPhaseOneMigration();
  await runPhaseOneMigration();

  const db = mongoose.connection.db;
  assert.ok(db);
  assert.equal(await db.collection('categories').countDocuments(), 8);
  assert.equal(await db.collection('approvedEmailDomains').countDocuments({ domain: 'seu.edu.bd', isActive: true }), 1);
  assert.equal(await db.collection<{ _id: string; campusTimeZone: string }>('universitySettings')
    .countDocuments({ _id: 'primary', campusTimeZone: 'Asia/Dhaka' }), 1);

  const hello = await db.admin().command({ hello: 1 });
  assert.ok(hello.setName, 'integration MongoDB must be a replica set');

  await db.dropDatabase();
  await disconnectDatabase();
});
