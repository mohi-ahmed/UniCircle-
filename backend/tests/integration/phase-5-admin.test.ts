import assert from 'node:assert/strict';
import test from 'node:test';

const testUri = process.env.MONGODB_TEST_URI;

test('Phase 5 domain and listing moderation changes are audited atomically', { skip: !testUri }, async (context) => {
  assert.ok(testUri);
  assert.notEqual(testUri, process.env.MONGODB_URI, 'MONGODB_TEST_URI must not be the application database URI.');
  process.env.MONGODB_URI = testUri;
  process.env.MONGODB_DB_NAME = 'UniCircle_phase5_test';
  process.env.UNIVERSITY_NAME = 'Southeast University';
  process.env.CSRF_SECRET = 'phase-5-integration-test-secret-value';
  process.env.NODE_ENV = 'test';

  const [{ connectDatabase, disconnectDatabase }, { runPhaseOneMigration }, models, { ApprovedEmailDomain }, { Category }, admin, listings, requests, security] = await Promise.all([
    import('../../src/lib/mongo.js'), import('../../src/migrations/phase-1.js'), import('../../src/models/core.js'),
    import('../../src/models/approved-email-domain.js'), import('../../src/models/category.js'), import('../../src/services/admin.js'),
    import('../../src/services/listings.js'), import('../../src/services/requests.js'), import('../../src/lib/security.js'),
  ]);
  await connectDatabase(); await runPhaseOneMigration();
  await Promise.all([models.ModerationAction.deleteMany({}), models.RequestRecord.deleteMany({}), models.Listing.deleteMany({}), models.User.deleteMany({}),
    ApprovedEmailDomain.deleteMany({ domain: { $ne: 'seu.edu.bd' } })]);
  context.after(async () => {
    await Promise.all([models.ModerationAction.deleteMany({}), models.RequestRecord.deleteMany({}), models.Listing.deleteMany({}), models.User.deleteMany({}),
      ApprovedEmailDomain.deleteMany({ domain: { $ne: 'seu.edu.bd' } })]);
    await disconnectDatabase();
  });

  const passwordHash = await security.hashPassword('ExamplePass123!');
  const adminUser = await models.User.create({ fullName: 'Admin User', displayName: 'Admin', universityEmail: 'phase5-admin@seu.edu.bd',
    emailDomain: 'seu.edu.bd', passwordHash, role: 'admin', verificationStatus: 'verified' });
  const owner = await models.User.create({ fullName: 'Listing Owner', displayName: 'Owner', universityEmail: 'phase5-owner@seu.edu.bd',
    emailDomain: 'seu.edu.bd', passwordHash, role: 'member', verificationStatus: 'verified' });
  const requester = await models.User.create({ fullName: 'Requester', displayName: 'Requester', universityEmail: 'phase5-requester@seu.edu.bd',
    emailDomain: 'seu.edu.bd', passwordHash, role: 'member', verificationStatus: 'verified' });
  const category = await Category.findOne({ code: 'electronics' }); assert.ok(category);

  const domain = await admin.addDomain(adminUser._id, ' mail.seu.edu.bd ');
  assert.equal(domain.domain, 'mail.seu.edu.bd');
  await admin.setDomainActive(adminUser._id, domain.id, false);
  assert.equal(await models.ModerationAction.countDocuments({ targetId: domain.id }), 2);

  const available = await listings.createListing(owner._id, { title: 'Moderated calculator', categoryId: category._id.toString(),
    description: 'A listing used to verify moderation behavior.', condition: 'good', listingType: 'sell', amountBdt: '500.00' });
  const pending = await requests.createRequest(requester._id, available!.id as string, {});
  const hidden = await admin.hideListing(adminUser._id, available!.id as string, 'Policy violation');
  assert.equal(hidden.isHidden, true);
  assert.equal((await models.RequestRecord.findById(pending.id))?.status, 'cancelled');
  assert.equal(await models.ModerationAction.countDocuments({ targetId: available!.id, actionType: 'listing.hide' }), 1);
  assert.deepEqual(Object.keys(hidden).sort(), ['createdAt', 'hiddenReason', 'id', 'isHidden', 'listingType', 'owner', 'status', 'title'].sort());

  const proposedPickupDate = requests.campusDate(new Date(Date.now() + 48 * 3_600_000));
  const returnDate = requests.campusDate(new Date(Date.now() + 96 * 3_600_000));
  const borrowed = await listings.createListing(owner._id, { title: 'Checked out book', categoryId: category._id.toString(),
    description: 'A borrowing listing used to verify hidden returns.', condition: 'good', listingType: 'free_borrowing', amountBdt: '0.00' });
  const loan = await requests.createRequest(requester._id, borrowed!.id as string, { proposedPickupDate, returnDate });
  await requests.acceptRequest(owner._id, loan.id, 'Main gate', new Date(`${proposedPickupDate}T12:00:00+06:00`));
  await requests.handoverRequest(owner._id, loan.id, false);
  await admin.hideListing(adminUser._id, borrowed!.id as string, 'Hidden during checkout');
  assert.equal((await models.RequestRecord.findById(loan.id))?.status, 'checked_out');
  await requests.returnRequest(owner._id, loan.id);
  const returnedListing = await models.Listing.findById(borrowed!.id);
  assert.equal(returnedListing?.status, 'available');
  assert.equal(returnedListing?.isHidden, true);
});
