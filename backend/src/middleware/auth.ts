import type { Request } from 'express';
import { getEnvironment } from '../config/env.js';
import { ApiError, parseCookies, requireAllowedOrigin, verifyGuestCsrf } from '../lib/http.js';
import { sha256 } from '../lib/security.js';
import { SessionRecord, User } from '../models/core.js';
import { connectDatabase } from '../lib/mongo.js';

export async function currentSession(request: Request) {
  const raw = parseCookies(request)[getEnvironment().SESSION_COOKIE_NAME];
  if (!raw) return null;
  await connectDatabase();
  const record = await SessionRecord.findOne({ sessionHash: sha256(raw) }).select('+sessionHash +csrfTokenHash');
  if (!record) return null;
  const now = Date.now();
  if (record.expiresAt.getTime() <= now || record.lastSeenAt.getTime() <= now - 30 * 60_000) {
    await SessionRecord.deleteOne({ _id: record._id });
    return null;
  }
  const user = await User.findById(record.userId);
  if (!user) return null;
  record.lastSeenAt = new Date(now);
  await record.save();
  return { record, user, raw };
}

export async function requireSession(request: Request) {
  const auth = await currentSession(request);
  if (!auth) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  return auth;
}

export async function requireSessionCsrf(request: Request) {
  requireAllowedOrigin(request);
  const auth = await requireSession(request);
  const token = request.get('x-csrf-token') ?? '';
  if (!token || sha256(token) !== auth.record.csrfTokenHash) throw new ApiError(403, 'CSRF_REJECTED', 'CSRF validation failed.');
  return auth;
}

export async function requireVerified(request: Request) {
  const auth = await requireSession(request);
  if (auth.user.verificationStatus !== 'verified') throw new ApiError(403, 'NOT_VERIFIED', 'Verify your university email to continue.');
  return auth;
}

export async function requireVerifiedCsrf(request: Request) {
  const auth = await requireSessionCsrf(request);
  if (auth.user.verificationStatus !== 'verified') throw new ApiError(403, 'NOT_VERIFIED', 'Verify your university email to continue.');
  return auth;
}

export async function requireAdmin(request: Request) {
  const auth = await requireVerified(request);
  if (auth.user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required.');
  return auth;
}

export async function requireAdminCsrf(request: Request) {
  const auth = await requireVerifiedCsrf(request);
  if (auth.user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required.');
  return auth;
}

export async function requirePublicCsrf(request: Request, guestCookieName: string): Promise<void> {
  requireAllowedOrigin(request);
  const auth = await currentSession(request);
  if (!auth) {
    verifyGuestCsrf(request, guestCookieName);
    return;
  }
  const token = request.get('x-csrf-token') ?? '';
  if (!token || sha256(token) !== auth.record.csrfTokenHash) throw new ApiError(403, 'CSRF_REJECTED', 'CSRF validation failed.');
}
