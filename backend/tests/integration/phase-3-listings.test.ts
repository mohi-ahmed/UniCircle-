import assert from 'node:assert/strict';
import test from 'node:test';

const testUri = process.env.MONGODB_TEST_URI;

test('Phase 3 listing create/edit/close/delete lifecycle is transactional', { skip: !testUri }, async (context) => {
  assert.ok(testUri);
  assert.notEqual(testUri, process.env.MONGODB_URI, 'MONGODB_TEST_URI must not be the application database URI.');
  process.env.MONGODB_URI = testUri;
  process.env.MONGODB_DB_NAME = 'UniCircle_phase3_test';
  process.env.UNIVERSITY_NAME = 'Southeast University';
  process.env.INITIAL_APPROVED_DOMAIN = 'seu.edu.bd';
  process.env.CSRF_SECRET = 'phase-3-integration-test-secret-value';
  process.env.NODE_ENV = 'test';

  const [{ connectDatabase, disconnectDatabase }, { runPhaseOneMigration }, models, { Category }, listingService, security] = await Promise.all([
    import('../../src/lib/mongo.js'), import('../../src/migrations/phase-1.js'), import('../../src/models/core.js'),
    import('../../src/models/category.js'), import('../../src/services/listings.js'), import('../../src/lib/security.js'),
  ]);
  await connectDatabase(); await runPhaseOneMigration();
  await Promise.all([models.RequestRecord.deleteMany({}), models.Listing.deleteMany({}), models.PhotoAsset.deleteMany({}), models.User.deleteMany({})]);
  context.after(async () => {
    await Promise.all([models.RequestRecord.deleteMany({}), models.Listing.deleteMany({}), models.PhotoAsset.deleteMany({}), models.User.deleteMany({})]);
    await disconnectDatabase();
  });

  const category = await Category.findOne({ code: 'electronics' }); assert.ok(category);
  const owner = await models.User.create({ fullName: 'Listing Owner', displayName: 'Owner', universityEmail: 'owner@seu.edu.bd',
    emailDomain: 'seu.edu.bd', passwordHash: await security.hashPassword('ExamplePass123!'), role: 'member', verificationStatus: 'verified' });
  const requester = await models.User.create({ fullName: 'Requester', displayName: 'Requester', universityEmail: 'requester@seu.edu.bd',
    emailDomain: 'seu.edu.bd', passwordHash: await security.hashPassword('ExamplePass123!'), role: 'member', verificationStatus: 'verified' });

  const created = await listingService.createListing(owner._id, { title: 'Scientific calculator', categoryId: category._id.toString(),
    description: 'A working calculator in good condition.', condition: 'good', listingType: 'sell', amountBdt: '500.00' });
  assert.equal(created?.amountBdt, '500.00');
  await models.RequestRecord.create({ listingId: created?.id, requesterId: requester._id, status: 'pending', listingType: 'sell', termsAmountPoisha: 50_000 });
  const edited = await listingService.updateListing(owner._id, created!.id as string, 1, { amountBdt: '450.00' });
  assert.equal(edited && 'version' in edited ? edited.version : undefined, 2);
  assert.equal((await models.RequestRecord.findOne({ listingId: created?.id }))?.status, 'cancelled');
  const closed = await listingService.closeOrDelete(owner._id, created!.id as string, false);
  assert.equal(closed?.status, 'closed');

  const disposable = await listingService.createListing(owner._id, { title: 'USB keyboard', categoryId: category._id.toString(),
    description: 'A compact USB keyboard for desktop use.', condition: 'fair', listingType: 'donate', amountBdt: '0.00' });
  await listingService.closeOrDelete(owner._id, disposable!.id as string, true);
  assert.ok((await models.Listing.findById(disposable?.id))?.deletedAt);
  const feed = await listingService.listFeed(owner._id.toString(), { limit: 20 });
  assert.equal(feed.items.length, 0);
});
