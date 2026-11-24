import mongoose from 'mongoose';
import { getEnvironment } from '../config/env.js';
import { CAMPUS_TIME_ZONE, CATEGORY_SEED, INITIAL_APPROVED_DOMAIN } from '../constants.js';
import { connectDatabase } from '../lib/mongo.js';
import { ApprovedEmailDomain } from '../models/approved-email-domain.js';
import { Category } from '../models/category.js';
import { UniversitySettings } from '../models/university-settings.js';

async function ensureCollectionsAndIndexes(): Promise<void> {
  const database = mongoose.connection.db;
  if (!database) throw new Error('MongoDB connection is not ready.');

  const existing = new Set((await database.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name));
  const collections = [
    'universitySettings', 'approvedEmailDomains', 'users', 'emailVerificationTokens',
    'passwordResetTokens', 'categories', 'listings', 'requests', 'sessions',
    'loginAttempts', 'emailSendAttempts', 'moderationActions', 'photoAssets',
  ];
  for (const collection of collections) {
    if (!existing.has(collection)) await database.createCollection(collection);
  }

  await Promise.all([
    database.collection('categories').createIndex({ code: 1 }, { name: 'categories_code_unique', unique: true }),
    database.collection('approvedEmailDomains').createIndex({ domain: 1 }, { name: 'approved_domains_domain_unique', unique: true }),
    database.collection('approvedEmailDomains').createIndex({ isActive: 1, domain: 1 }, { name: 'approved_domains_active_domain' }),
    database.collection('users').createIndex({ universityEmail: 1 }, { name: 'users_university_email_unique', unique: true }),
    database.collection('emailVerificationTokens').createIndex({ tokenHash: 1 }, { name: 'email_verification_token_hash_unique', unique: true }),
    database.collection('emailVerificationTokens').createIndex({ userId: 1, createdAt: -1 }, { name: 'email_verification_user_created' }),
    database.collection('emailVerificationTokens').createIndex({ expiresAt: 1 }, { name: 'email_verification_expiry_ttl', expireAfterSeconds: 172_800 }),
    database.collection('passwordResetTokens').createIndex({ tokenHash: 1 }, { name: 'password_reset_token_hash_unique', unique: true }),
    database.collection('passwordResetTokens').createIndex({ userId: 1, createdAt: -1 }, { name: 'password_reset_user_created' }),
    database.collection('passwordResetTokens').createIndex({ expiresAt: 1 }, { name: 'password_reset_expiry_ttl', expireAfterSeconds: 172_800 }),
    database.collection('listings').createIndex({ status: 1, isHidden: 1, deletedAt: 1, createdAt: -1, _id: -1 }, { name: 'listings_feed' }),
    database.collection('listings').createIndex({ ownerId: 1, createdAt: -1, _id: -1 }, { name: 'listings_owner_created' }),
    database.collection('listings').createIndex({ categoryId: 1, status: 1, isHidden: 1, deletedAt: 1, createdAt: -1, _id: -1 }, { name: 'listings_category_feed' }),
    database.collection('listings').createIndex({ listingType: 1, status: 1, isHidden: 1, deletedAt: 1, createdAt: -1, _id: -1 }, { name: 'listings_type_feed' }),
    database.collection('listings').createIndex({ title: 'text' }, { name: 'listings_title_text' }),
    database.collection('requests').createIndex({ listingId: 1, requesterId: 1 }, {
      name: 'requests_one_active_per_requester', unique: true,
      partialFilterExpression: { status: { $in: ['pending', 'accepted', 'checked_out'] } },
    }),
    database.collection('requests').createIndex({ listingId: 1 }, {
      name: 'requests_one_live_per_listing', unique: true,
      partialFilterExpression: { status: { $in: ['accepted', 'checked_out'] } },
    }),
    database.collection('requests').createIndex({ listingId: 1, status: 1 }, { name: 'requests_listing_status' }),
    database.collection('requests').createIndex({ requesterId: 1, createdAt: -1, _id: -1 }, { name: 'requests_requester_created' }),
    database.collection('sessions').createIndex({ sessionHash: 1 }, { name: 'sessions_hash_unique', unique: true }),
    database.collection('sessions').createIndex({ userId: 1, createdAt: 1 }, { name: 'sessions_user_created' }),
    database.collection('sessions').createIndex({ expiresAt: 1 }, { name: 'sessions_expiry_ttl', expireAfterSeconds: 0 }),
    database.collection('loginAttempts').createIndex({ identifierHash: 1, attemptedAt: -1 }, { name: 'login_attempt_identifier_time' }),
    database.collection('loginAttempts').createIndex({ attemptedAt: 1 }, { name: 'login_attempt_retention_ttl', expireAfterSeconds: 86_400 }),
    database.collection('emailSendAttempts').createIndex({ identifierHash: 1, purpose: 1, attemptedAt: -1 }, { name: 'email_attempt_identifier_purpose_time' }),
    database.collection('emailSendAttempts').createIndex({ ipHash: 1, eventType: 1, attemptedAt: -1 }, { name: 'email_attempt_ip_event_time' }),
    database.collection('emailSendAttempts').createIndex({ attemptedAt: 1 }, { name: 'email_attempt_retention_ttl', expireAfterSeconds: 86_400 }),
    database.collection('moderationActions').createIndex({ targetType: 1, targetId: 1, createdAt: -1 }, { name: 'moderation_target_created' }),
    database.collection('photoAssets').createIndex({ storageKey: 1 }, { name: 'photo_assets_storage_key_unique', unique: true }),
    database.collection('photoAssets').createIndex({ ownerId: 1, status: 1, createdAt: -1 }, { name: 'photo_assets_owner_status_created' }),
    database.collection('photoAssets').createIndex({ attachedListingId: 1 }, {
      name: 'photo_assets_attached_listing_unique', unique: true,
      partialFilterExpression: { attachedListingId: { $type: 'objectId' } },
    }),
  ]);
}

export async function runPhaseOneMigration(): Promise<void> {
  const env = getEnvironment();
  await connectDatabase();
  await ensureCollectionsAndIndexes();

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await UniversitySettings.updateOne(
        { _id: 'primary' },
        { $set: { universityName: env.UNIVERSITY_NAME, campusTimeZone: CAMPUS_TIME_ZONE } },
        { upsert: true, session, runValidators: true },
      );

      for (const category of CATEGORY_SEED) {
        await Category.updateOne(
          { code: category.code },
          { $setOnInsert: category },
          { upsert: true, session, runValidators: true },
        );
      }

      await ApprovedEmailDomain.updateOne(
        { domain: INITIAL_APPROVED_DOMAIN },
        { $setOnInsert: { domain: INITIAL_APPROVED_DOMAIN, isActive: true, createdBy: null, updatedBy: null } },
        { upsert: true, session, runValidators: true },
      );
    });
  } finally {
    await session.endSession();
  }
}
