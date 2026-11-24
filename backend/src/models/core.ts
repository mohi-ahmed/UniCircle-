import mongoose, { type InferSchemaType, type Model } from 'mongoose';
import {
  CONDITIONS,
  LISTING_STATUSES,
  LISTING_TYPES,
  REQUEST_STATUSES,
  USER_ROLES,
  VERIFICATION_STATUSES,
} from '../constants.js';

function existingOrCreate<T>(name: string, schema: mongoose.Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T> | undefined) ?? mongoose.model<T>(name, schema);
}

const objectId = mongoose.Schema.Types.ObjectId;

const userSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true, maxlength: 100 },
  displayName: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
  universityEmail: { type: String, required: true, lowercase: true, trim: true },
  emailDomain: { type: String, required: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, required: true, enum: USER_ROLES, default: 'member' },
  verificationStatus: { type: String, required: true, enum: VERIFICATION_STATUSES, default: 'unverified' },
  emailVerifiedAt: { type: Date, default: null },
}, { collection: 'users', strict: 'throw', timestamps: true, versionKey: false });

const tokenFields = {
  userId: { type: objectId, required: true },
  tokenHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, required: true, default: Date.now },
} as const;
const emailVerificationTokenSchema = new mongoose.Schema(tokenFields, {
  collection: 'emailVerificationTokens', strict: 'throw', versionKey: false,
});
const passwordResetTokenSchema = new mongoose.Schema(tokenFields, {
  collection: 'passwordResetTokens', strict: 'throw', versionKey: false,
});

const listingSchema = new mongoose.Schema({
  ownerId: { type: objectId, required: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
  categoryId: { type: objectId, required: true },
  description: { type: String, required: true, minlength: 10, maxlength: 2_000 },
  condition: { type: String, required: true, enum: CONDITIONS },
  photo: {
    type: new mongoose.Schema({ storageKey: String, secureUrl: String }, { _id: false, strict: 'throw' }),
    default: null,
  },
  listingType: { type: String, required: true, enum: LISTING_TYPES },
  amountPoisha: { type: Number, default: null, min: 0, max: 999_999_999 },
  exchangeTerms: { type: String, default: null, maxlength: 500 },
  status: { type: String, required: true, enum: LISTING_STATUSES, default: 'available' },
  isHidden: { type: Boolean, required: true, default: false },
  hiddenReason: { type: String, default: null, maxlength: 500 },
  hiddenAt: { type: Date, default: null },
  hiddenBy: { type: objectId, default: null },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: objectId, default: null },
  version: { type: Number, required: true, min: 1, default: 1 },
  mutationVersion: { type: Number, required: true, min: 1, default: 1 },
}, { collection: 'listings', strict: 'throw', timestamps: true, versionKey: false });

const requestSchema = new mongoose.Schema({
  listingId: { type: objectId, required: true },
  requesterId: { type: objectId, required: true },
  status: { type: String, required: true, enum: REQUEST_STATUSES, default: 'pending' },
  listingType: { type: String, required: true, enum: LISTING_TYPES },
  termsAmountPoisha: { type: Number, default: null, min: 0, max: 999_999_999 },
  listingExchangeTerms: { type: String, default: null, maxlength: 500 },
  proposedPickupDate: { type: String, default: null },
  returnDate: { type: String, default: null },
  rentalFeePoisha: { type: Number, default: null, min: 0, max: 999_999_999 },
  offeredItemDescription: { type: String, default: null, maxlength: 500 },
  pickupPoint: { type: String, default: null, maxlength: 120 },
  pickupAt: { type: Date, default: null },
  handedOverAt: { type: Date, default: null },
  returnedAt: { type: Date, default: null },
  cancellationReason: { type: String, default: null, maxlength: 500 },
}, { collection: 'requests', strict: 'throw', timestamps: true, versionKey: false });

const sessionSchema = new mongoose.Schema({
  sessionHash: { type: String, required: true, select: false },
  userId: { type: objectId, required: true },
  csrfTokenHash: { type: String, required: true, select: false },
  createdAt: { type: Date, required: true, default: Date.now },
  lastSeenAt: { type: Date, required: true, default: Date.now },
  expiresAt: { type: Date, required: true },
}, { collection: 'sessions', strict: 'throw', versionKey: false });

const loginAttemptSchema = new mongoose.Schema({
  identifierHash: { type: String, required: true, select: false },
  ipHash: { type: String, required: true, select: false },
  attemptedAt: { type: Date, required: true, default: Date.now },
  succeeded: { type: Boolean, required: true, default: false },
}, { collection: 'loginAttempts', strict: 'throw', versionKey: false });

const emailSendAttemptSchema = new mongoose.Schema({
  identifierHash: { type: String, required: true, select: false },
  ipHash: { type: String, required: true, select: false },
  purpose: { type: String, required: true, enum: ['verification', 'password_reset'] },
  eventType: { type: String, required: true, enum: ['register', 'resend', 'forgot_password'] },
  attemptedAt: { type: Date, required: true, default: Date.now },
  sent: { type: Boolean, required: true, default: false },
}, { collection: 'emailSendAttempts', strict: 'throw', versionKey: false });

const moderationActionSchema = new mongoose.Schema({
  adminId: { type: objectId, required: true },
  actionType: { type: String, required: true, enum: ['domain.add', 'domain.activate', 'domain.deactivate', 'listing.hide'] },
  targetType: { type: String, required: true, enum: ['approved_email_domain', 'listing'] },
  targetId: { type: objectId, required: true },
  reason: { type: String, default: null, maxlength: 500 },
  metadata: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt: { type: Date, required: true, default: Date.now },
}, { collection: 'moderationActions', strict: 'throw', versionKey: false });

const photoAssetSchema = new mongoose.Schema({
  ownerId: { type: objectId, required: true },
  storageKey: { type: String, required: true },
  expectedSizeBytes: { type: Number, required: true, min: 1, max: 5_242_880 },
  expectedContentType: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] },
  status: { type: String, required: true, enum: ['issued', 'verified', 'attached', 'rejected'] },
  secureUrl: { type: String, default: null },
  issuedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  attachedListingId: { type: objectId, default: null },
  createdAt: { type: Date, required: true, default: Date.now },
}, { collection: 'photoAssets', strict: 'throw', versionKey: false });

export type UserDocument = InferSchemaType<typeof userSchema>;
export type ListingDocument = InferSchemaType<typeof listingSchema>;
export const User = existingOrCreate<UserDocument>('User', userSchema);
export const EmailVerificationToken = existingOrCreate('EmailVerificationToken', emailVerificationTokenSchema);
export const PasswordResetToken = existingOrCreate('PasswordResetToken', passwordResetTokenSchema);
export const Listing = existingOrCreate('Listing', listingSchema);
export const RequestRecord = existingOrCreate('RequestRecord', requestSchema);
export const SessionRecord = existingOrCreate('SessionRecord', sessionSchema);
export const LoginAttempt = existingOrCreate('LoginAttempt', loginAttemptSchema);
export const EmailSendAttempt = existingOrCreate('EmailSendAttempt', emailSendAttemptSchema);
export const ModerationAction = existingOrCreate('ModerationAction', moderationActionSchema);
export const PhotoAsset = existingOrCreate('PhotoAsset', photoAssetSchema);
