import assert from 'node:assert/strict';
import test from 'node:test';

const testUri = process.env.MONGODB_TEST_URI;

test('Phase 4 request transitions stay atomic across 50 concurrent accept races', { skip: !testUri }, async (context) => {
  assert.ok(testUri);
  assert.notEqual(testUri, process.env.MONGODB_URI, 'MONGODB_TEST_URI must not be the application database URI.');
  process.env.MONGODB_URI = testUri;
  process.env.MONGODB_DB_NAME = 'UniCircle_phase4_test';
  process.env.UNIVERSITY_NAME = 'Southeast University';
  process.env.CSRF_SECRET = 'phase-4-integration-test-secret-value';
  process.env.NODE_ENV = 'test';

  const [{ connectDatabase, disconnectDatabase }, { runPhaseOneMigration }, models, { Category }, listings, requests, security] = await Promise.all([
    import('../../src/lib/mongo.js'), import('../../src/migrations/phase-1.js'), import('../../src/models/core.js'),
    import('../../src/models/category.js'), import('../../src/services/listings.js'), import('../../src/services/requests.js'), import('../../src/lib/security.js'),
  ]);
  await connectDatabase(); await runPhaseOneMigration();
  await Promise.all([models.RequestRecord.deleteMany({}), models.Listing.deleteMany({}), models.User.deleteMany({})]);
  context.after(async () => {
    await Promise.all([models.RequestRecord.deleteMany({}), models.Listing.deleteMany({}), models.User.deleteMany({})]);
    await disconnectDatabase();
  });

  const category = await Category.findOne({ code: 'electronics' }); assert.ok(category);
  const passwordHash = await security.hashPassword('ExamplePass123!');
  const owner = await models.User.create({ fullName: 'Request Owner', displayName: 'Owner', universityEmail: 'phase4-owner@seu.edu.bd',
    emailDomain: 'seu.edu.bd', passwordHash, role: 'member', verificationStatus: 'verified' });
  const requesterA = await models.User.create({ fullName: 'Requester A', displayName: 'Requester A', universityEmail: 'phase4-a@seu.edu.bd',
    emailDomain: 'seu.edu.bd', passwordHash, role: 'member', verificationStatus: 'verified' });
  const requesterB = await models.User.create({ fullName: 'Requester B', displayName: 'Requester B', universityEmail: 'phase4-b@seu.edu.bd',
    emailDomain: 'seu.edu.bd', passwordHash, role: 'member', verificationStatus: 'verified' });

  for (let run = 0; run < 50; run += 1) {
    const listing = await listings.createListing(owner._id, { title: `Race calculator ${run}`, categoryId: category._id.toString(),
      description: 'A working calculator used to verify request races.', condition: 'good', listingType: 'sell', amountBdt: '500.00' });
    const [first, second] = await Promise.all([
      requests.createRequest(requesterA._id, listing!.id as string, {}),
      requests.createRequest(requesterB._id, listing!.id as string, {}),
    ]);
    const pickup = new Date(Date.now() + 3_600_000);
    const results = await Promise.allSettled([
      requests.acceptRequest(owner._id, first.id, 'Main gate', pickup),
      requests.acceptRequest(owner._id, second.id, 'Library entrance', pickup),
    ]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(results.filter(result => result.status === 'rejected').length, 1);
    assert.equal(await models.RequestRecord.countDocuments({ listingId: listing!.id, status: 'accepted' }), 1);
    assert.equal(await models.RequestRecord.countDocuments({ listingId: listing!.id, status: 'declined' }), 1);
    assert.equal((await models.Listing.findById(listing!.id))?.status, 'reserved');
  }

  const proposedPickupDate = requests.campusDate(new Date(Date.now() + 48 * 3_600_000));
  const returnDate = requests.campusDate(new Date(Date.now() + 96 * 3_600_000));
  const temporary = await listings.createListing(owner._id, { title: 'Hidden borrowing item', categoryId: category._id.toString(),
    description: 'A temporary listing used to verify hidden return behavior.', condition: 'good', listingType: 'free_borrowing', amountBdt: '0.00' });
  const borrowing = await requests.createRequest(requesterA._id, temporary!.id as string, { proposedPickupDate, returnDate });
  await requests.acceptRequest(owner._id, borrowing.id, 'Main gate', new Date(`${proposedPickupDate}T12:00:00+06:00`));
  await requests.handoverRequest(owner._id, borrowing.id, false);
  await models.Listing.updateOne({ _id: temporary!.id }, { $set: { isHidden: true, hiddenReason: 'moderation test' } });
  await requests.returnRequest(owner._id, borrowing.id);
  const updated = await models.Listing.findById(temporary!.id);
  assert.equal(updated?.status, 'available');
  assert.equal(updated?.isHidden, true);
});
