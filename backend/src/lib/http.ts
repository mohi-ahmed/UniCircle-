import type { Request, Response } from 'express';
import { getEnvironment } from '../config/env.js';
import { safeEqual, sign } from './security.js';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details: Record<string, unknown> = {},
    public readonly retryAfterSeconds?: number,
  ) { super(message); }
}

export function errorResponse(code: string, message: string, details: Record<string, unknown>) {
  return { error: { code, message, details } };
}

export function parseCookies(request: Request): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    try { result[key] = decodeURIComponent(part.slice(index + 1).trim()); } catch { /* Ignore malformed cookies. */ }
  }
  return result;
}

type CookieOptions = { httpOnly?: boolean; maxAge?: number; clear?: boolean };

export function setCookie(response: Response, name: string, value: string, options: CookieOptions = {}): void {
  const env = getEnvironment();
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'SameSite=Lax'];
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (env.NODE_ENV === 'production') parts.push('Secure');
  if (options.clear) parts.push('Max-Age=0', 'Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  else if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  response.appendHeader('Set-Cookie', parts.join('; '));
}

export function requestIp(request: Request): string {
  if (process.env.VERCEL === '1') {
    const forwarded = request.get('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
  }
  return request.socket.remoteAddress ?? 'unknown';
}

export function requireAllowedOrigin(request: Request): void {
  const origin = request.get('origin');
  const allowed = new Set(getEnvironment().ALLOWED_ORIGINS.split(',').map(value => value.trim()).filter(Boolean));
  if (!origin || !allowed.has(origin)) throw new ApiError(403, 'ORIGIN_REJECTED', 'Request origin is not allowed.');
}

export function guestCsrfCookieValue(token: string): string {
  return `${token}.${sign(token)}`;
}

export function verifyGuestCsrf(request: Request, cookieName: string): void {
  requireAllowedOrigin(request);
  const header = request.get('x-csrf-token') ?? '';
  const cookie = parseCookies(request)[cookieName] ?? '';
  const separator = cookie.lastIndexOf('.');
  const token = separator > 0 ? cookie.slice(0, separator) : '';
  const signature = separator > 0 ? cookie.slice(separator + 1) : '';
  if (!header || !safeEqual(header, token) || !safeEqual(signature, sign(token))) {
    throw new ApiError(403, 'CSRF_REJECTED', 'CSRF validation failed.');
  }
}
