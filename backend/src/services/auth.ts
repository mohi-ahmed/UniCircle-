import mongoose from 'mongoose';
import { ApprovedEmailDomain } from '../models/approved-email-domain.js';
import {
  EmailSendAttempt, EmailVerificationToken, LoginAttempt, PasswordResetToken,
  SessionRecord, User, type UserDocument,
} from '../models/core.js';
import { ApiError } from '../lib/http.js';
import { hashPassword, privateHash, randomToken, sha256, verifyPassword } from '../lib/security.js';
import { sendAccountEmail } from './email.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type UserSelf = {
  id: string; fullName: string; displayName: string; universityEmail: string;
  role: 'member' | 'admin'; verificationStatus: 'unverified' | 'verified';
};

export function userSelf(user: UserDocument & { _id: mongoose.Types.ObjectId }): UserSelf {
  return {
    id: user._id.toString(), fullName: user.fullName, displayName: user.displayName,
    universityEmail: user.universityEmail, role: user.role, verificationStatus: user.verificationStatus,
  };
}

export function normalizeEmail(value: string): { email: string; domain: string } {
  const email = value.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  return { email, domain: at >= 0 ? email.slice(at + 1) : '' };
}

async function assertEmailRate(identifier: string, ip: string, eventType: 'register' | 'resend' | 'forgot_password'): Promise<void> {
  const now = new Date();
  const identifierHash = privateHash(identifier);
  const ipHash = privateHash(ip);
  const purpose = eventType === 'forgot_password' ? 'password_reset' : 'verification';
  const [accountCount, ipCount] = await Promise.all([
    EmailSendAttempt.countDocuments({ identifierHash, eventType, attemptedAt: { $gt: new Date(now.getTime() - HOUR) } }),
    EmailSendAttempt.countDocuments({ ipHash, eventType, attemptedAt: { $gt: new Date(now.getTime() - HOUR) } }),
  ]);
  const accountLimit = eventType === 'forgot_password' ? 3 : eventType === 'resend' ? 5 : Number.POSITIVE_INFINITY;
  const ipLimit = eventType === 'forgot_password' ? 10 : eventType === 'resend' ? 30 : 20;
  if (accountCount >= accountLimit || ipCount >= ipLimit) throw new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again later.', {}, 3600);
  await EmailSendAttempt.create({ identifierHash, ipHash, purpose, eventType, attemptedAt: now, sent: false });
}

async function markEmailSent(identifier: string, eventType: 'register' | 'resend' | 'forgot_password'): Promise<void> {
  const attempt = await EmailSendAttempt.findOne({
    identifierHash: privateHash(identifier), eventType, sent: false,
  }).sort({ attemptedAt: -1 });
  if (attempt) {
    attempt.sent = true;
    await attempt.save();
  }
}

export async function register(input: { fullName: string; displayName: string; universityEmail: string; password: string }, ip: string) {
  const { email, domain } = normalizeEmail(input.universityEmail);
  await assertEmailRate(email, ip, 'register');
  const approved = await ApprovedEmailDomain.exists({ domain, isActive: true });
  if (!approved) throw new ApiError(400, 'VALIDATION_ERROR', 'Registration details are invalid.', { fields: { universityEmail: 'Use an active approved university email domain.' } });
  const passwordHash = await hashPassword(input.password);
  const rawToken = randomToken();
  const session = await mongoose.startSession();
  let userId = '';
  try {
    await session.withTransaction(async () => {
      const [user] = await User.create([{
        fullName: input.fullName.trim(), displayName: input.displayName.trim(), universityEmail: email,
        emailDomain: domain, passwordHash, role: 'member', verificationStatus: 'unverified',
      }], { session });
      if (!user) throw new Error('User creation failed.');
      userId = user._id.toString();
      await EmailVerificationToken.create([{
        userId: user._id, tokenHash: sha256(rawToken), expiresAt: new Date(Date.now() + HOUR), usedAt: null,
      }], { session });
    });
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
      throw new ApiError(409, 'ALREADY_REGISTERED', 'An account already exists for this email.', { fields: { universityEmail: 'Already registered.' } });
    }
    throw error;
  } finally { await session.endSession(); }
  const emailSent = await sendAccountEmail('verification', email, rawToken);
  if (emailSent) await markEmailSent(email, 'register');
  return { account: { id: userId, verificationStatus: 'unverified' as const }, emailSent };
}

export async function verifyEmail(rawToken: string): Promise<void> {
  const tokenHash = sha256(rawToken);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const token = await EmailVerificationToken.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } }).session(session);
      if (!token) throw new ApiError(400, 'INVALID_TOKEN', 'Verification link is invalid or expired.');
      const user = await User.findById(token.userId).session(session);
      if (!user || user.verificationStatus !== 'unverified') throw new ApiError(400, 'INVALID_TOKEN', 'Verification link is invalid or expired.');
      const domain = await ApprovedEmailDomain.exists({ domain: user.emailDomain, isActive: true }).session(session);
      if (!domain) throw new ApiError(400, 'INACTIVE_DOMAIN', 'This university email domain is not active.');
      const consumed = await EmailVerificationToken.updateOne({ _id: token._id, usedAt: null }, { $set: { usedAt: new Date() } }, { session });
      if (consumed.modifiedCount !== 1) throw new ApiError(400, 'INVALID_TOKEN', 'Verification link is invalid or expired.');
      await User.updateOne({ _id: user._id, verificationStatus: 'unverified' }, { $set: { verificationStatus: 'verified', emailVerifiedAt: new Date() } }, { session });
    });
  } finally { await session.endSession(); }
}

export async function resendVerification(universityEmail: string, ip: string): Promise<void> {
  const { email } = normalizeEmail(universityEmail);
  await assertEmailRate(email, ip, 'resend');
  const user = await User.findOne({ universityEmail: email, verificationStatus: 'unverified' });
  if (!user) return;
  const active = await ApprovedEmailDomain.exists({ domain: user.emailDomain, isActive: true });
  if (!active) return;
  const rawToken = randomToken();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await EmailVerificationToken.updateMany({ userId: user._id, usedAt: null }, { $set: { usedAt: new Date() } }, { session });
      await EmailVerificationToken.create([{ userId: user._id, tokenHash: sha256(rawToken), expiresAt: new Date(Date.now() + HOUR), usedAt: null }], { session });
    });
  } finally { await session.endSession(); }
  if (await sendAccountEmail('verification', email, rawToken)) await markEmailSent(email, 'resend');
}

export async function login(universityEmail: string, password: string, ip: string) {
  const { email } = normalizeEmail(universityEmail);
  const identifierHash = privateHash(email);
  const ipHash = privateHash(ip);
  const windowStart = new Date(Date.now() - 15 * MINUTE);
  const [failures, ipAttempts] = await Promise.all([
    LoginAttempt.countDocuments({ identifierHash, succeeded: false, attemptedAt: { $gt: windowStart } }),
    LoginAttempt.countDocuments({ ipHash, attemptedAt: { $gt: windowStart } }),
  ]);
  if (failures >= 5 || ipAttempts >= 100) throw new ApiError(429, 'LOGIN_LOCKED', 'Too many sign-in attempts. Try again later.', {}, 900);
  const user = await User.findOne({ universityEmail: email }).select('+passwordHash');
  const valid = Boolean(user && await verifyPassword(user.passwordHash, password));
  await LoginAttempt.create({ identifierHash, ipHash, attemptedAt: new Date(), succeeded: valid });
  if (!valid || !user) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Invalid university email or password.');
  return user;
}

export async function createSession(userId: mongoose.Types.ObjectId) {
  const rawSession = randomToken();
  const csrfToken = randomToken();
  const now = new Date();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await SessionRecord.create([{
        sessionHash: sha256(rawSession), userId, csrfTokenHash: sha256(csrfToken), createdAt: now,
        lastSeenAt: now, expiresAt: new Date(now.getTime() + 7 * DAY),
      }], { session });
      const old = await SessionRecord.find({ userId }).sort({ createdAt: -1 }).skip(5).select('_id').session(session);
      if (old.length) await SessionRecord.deleteMany({ _id: { $in: old.map(item => item._id) } }, { session });
    });
  } finally { await session.endSession(); }
  return { rawSession, csrfToken };
}

export async function forgotPassword(universityEmail: string, ip: string): Promise<void> {
  const { email } = normalizeEmail(universityEmail);
  await assertEmailRate(email, ip, 'forgot_password');
  const user = await User.findOne({ universityEmail: email });
  if (!user) return;
  const rawToken = randomToken();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await PasswordResetToken.updateMany({ userId: user._id, usedAt: null }, { $set: { usedAt: new Date() } }, { session });
      await PasswordResetToken.create([{ userId: user._id, tokenHash: sha256(rawToken), expiresAt: new Date(Date.now() + 30 * MINUTE), usedAt: null }], { session });
    });
  } finally { await session.endSession(); }
  if (await sendAccountEmail('password_reset', email, rawToken)) await markEmailSent(email, 'forgot_password');
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = sha256(rawToken);
  const passwordHash = await hashPassword(newPassword);
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const token = await PasswordResetToken.findOne({ tokenHash, usedAt: null, expiresAt: { $gt: new Date() } }).session(session);
      if (!token) throw new ApiError(400, 'INVALID_TOKEN', 'Password reset link is invalid or expired.');
      const consumed = await PasswordResetToken.updateOne({ _id: token._id, usedAt: null }, { $set: { usedAt: new Date() } }, { session });
      if (consumed.modifiedCount !== 1) throw new ApiError(400, 'INVALID_TOKEN', 'Password reset link is invalid or expired.');
      await User.updateOne({ _id: token.userId }, { $set: { passwordHash } }, { session });
      await PasswordResetToken.updateMany({ userId: token.userId, usedAt: null }, { $set: { usedAt: new Date() } }, { session });
      await SessionRecord.deleteMany({ userId: token.userId }, { session });
    });
  } finally { await session.endSession(); }
}
