import { Router, type RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { getEnvironment } from '../config/env.js';
import { ApiError, guestCsrfCookieValue, requestIp, setCookie } from '../lib/http.js';
import { privateHash, randomToken, sha256 } from '../lib/security.js';
import { connectDatabase } from '../lib/mongo.js';
import { currentSession, requirePublicCsrf, requireSession, requireSessionCsrf } from '../middleware/auth.js';
import { EmailSendAttempt, SessionRecord } from '../models/core.js';
import {
  createSession, forgotPassword, login, register, resendVerification, resetPassword,
  userSelf, verifyEmail,
} from '../services/auth.js';

export const authRouter = Router();
const guestCookie = 'uc_guest_csrf';
const email = z.string().trim().toLowerCase().email().max(254);
const password = z.string().min(8);
const registerSchema = z.object({
  fullName: z.string().trim().min(1).max(100), displayName: z.string().trim().min(2).max(50),
  universityEmail: email, password,
}).strict();
const verifySchema = z.object({ token: z.string().min(16) }).strict();
const emailSchema = z.object({ universityEmail: email }).strict();
const loginSchema = z.object({ universityEmail: email, password: z.string().min(1) }).strict();
const resetSchema = z.object({ token: z.string().min(16), newPassword: password }).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); }
  catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const fields: Record<string, string> = {};
    for (const issue of error.issues) fields[String(issue.path[0] ?? 'body')] = issue.message;
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', { fields });
  }
}

function asyncRoute(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

authRouter.get('/auth/csrf', asyncRoute(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  const auth = await currentSession(request);
  const token = randomToken();
  if (auth) {
    auth.record.csrfTokenHash = sha256(token);
    await auth.record.save();
  } else {
    setCookie(response, guestCookie, guestCsrfCookieValue(token), { maxAge: 7_200 });
  }
  response.json({ data: { csrfToken: token } });
}));

authRouter.use([
  '/auth/register', '/auth/verify-email', '/auth/resend-verification', '/auth/login', '/auth/logout',
  '/auth/me', '/verification/status', '/auth/forgot-password', '/auth/reset-password',
], asyncRoute(async (_request, _response, next) => {
  await connectDatabase();
  next();
}));

authRouter.post('/auth/register', asyncRoute(async (request, response) => {
  await requirePublicCsrf(request, guestCookie);
  const data = await register(parse(registerSchema, request.body), requestIp(request));
  response.status(201).json({ data });
}));

authRouter.post('/auth/verify-email', asyncRoute(async (request, response) => {
  await requirePublicCsrf(request, guestCookie);
  await verifyEmail(parse(verifySchema, request.body).token);
  response.json({ data: { verificationStatus: 'verified' } });
}));

authRouter.post('/auth/resend-verification', asyncRoute(async (request, response) => {
  await requirePublicCsrf(request, guestCookie);
  await resendVerification(parse(emailSchema, request.body).universityEmail, requestIp(request));
  response.status(202).json({ data: { message: 'If eligible, a verification email will be sent.' } });
}));

authRouter.post('/auth/login', asyncRoute(async (request, response) => {
  await requirePublicCsrf(request, guestCookie);
  const body = parse(loginSchema, request.body);
  const user = await login(body.universityEmail, body.password, requestIp(request));
  const session = await createSession(user._id);
  const env = getEnvironment();
  setCookie(response, env.SESSION_COOKIE_NAME, session.rawSession, { maxAge: 7 * 24 * 60 * 60 });
  setCookie(response, guestCookie, '', { clear: true });
  response.setHeader('Cache-Control', 'no-store');
  response.json({ data: { user: userSelf(user), csrfToken: session.csrfToken } });
}));

authRouter.post('/auth/logout', asyncRoute(async (request, response) => {
  const auth = await requireSessionCsrf(request);
  await SessionRecord.deleteOne({ _id: auth.record._id });
  setCookie(response, getEnvironment().SESSION_COOKIE_NAME, '', { clear: true });
  response.status(204).end();
}));

authRouter.get('/auth/me', asyncRoute(async (request, response) => {
  const auth = await requireSession(request);
  response.setHeader('Cache-Control', 'no-store');
  response.json({ data: { user: userSelf(auth.user) } });
}));

authRouter.get('/verification/status', asyncRoute(async (request, response) => {
  const auth = await requireSession(request);
  const since = new Date(Date.now() - 60 * 60_000);
  const recent = await EmailSendAttempt.countDocuments({
    identifierHash: privateHash(auth.user.universityEmail),
    eventType: 'resend', attemptedAt: { $gt: since },
  });
  response.setHeader('Cache-Control', 'no-store');
  response.json({ data: { verificationStatus: auth.user.verificationStatus, canResend: auth.user.verificationStatus === 'unverified' && recent < 5 } });
}));

authRouter.post('/auth/forgot-password', asyncRoute(async (request, response) => {
  await requirePublicCsrf(request, guestCookie);
  await forgotPassword(parse(emailSchema, request.body).universityEmail, requestIp(request));
  response.status(202).json({ data: { message: 'If the account exists, a reset email will be sent.' } });
}));

authRouter.post('/auth/reset-password', asyncRoute(async (request, response) => {
  await requirePublicCsrf(request, guestCookie);
  const body = parse(resetSchema, request.body);
  await resetPassword(body.token, body.newPassword);
  response.json({ data: { message: 'Password updated. Please sign in again.' } });
}));
