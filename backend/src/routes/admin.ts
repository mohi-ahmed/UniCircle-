import { Router, type RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { LISTING_STATUSES } from '../constants.js';
import { ApiError } from '../lib/http.js';
import { requireAdmin, requireAdminCsrf } from '../middleware/auth.js';
import { addDomain, adminListingDetail, hideListing, listAdminListings, listDomains, setDomainActive } from '../services/admin.js';

export const adminRouter = Router();
const id = z.string().regex(/^[a-f0-9]{24}$/);
const addDomainSchema = z.object({ domain: z.string().trim().min(3).max(253) }).strict();
const patchDomainSchema = z.object({ isActive: z.boolean() }).strict();
const hideSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
const listingQuerySchema = z.object({ q: z.string().trim().max(100).optional(), status: z.enum(LISTING_STATUSES).optional(),
  hidden: z.enum(['true', 'false']).transform(value => value === 'true').optional(), limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).optional() }).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const fields: Record<string, string> = {};
    for (const issue of error.issues) fields[String(issue.path[0] ?? 'body')] = issue.message;
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', { fields });
  }
}
function asyncRoute(handler: RequestHandler): RequestHandler { return (request, response, next) => { Promise.resolve(handler(request, response, next)).catch(next); }; }

adminRouter.get('/admin/domains', asyncRoute(async (request, response) => {
  await requireAdmin(request); response.json({ data: { items: await listDomains() } });
}));
adminRouter.post('/admin/domains', asyncRoute(async (request, response) => {
  const auth = await requireAdminCsrf(request); const body = parse(addDomainSchema, request.body);
  response.status(201).json({ data: { domain: await addDomain(auth.user._id, body.domain) } });
}));
adminRouter.patch('/admin/domains/:id', asyncRoute(async (request, response) => {
  const auth = await requireAdminCsrf(request); const domainId = parse(id, request.params.id); const body = parse(patchDomainSchema, request.body);
  response.json({ data: { domain: await setDomainActive(auth.user._id, domainId, body.isActive) } });
}));
adminRouter.get('/admin/listings', asyncRoute(async (request, response) => {
  await requireAdmin(request); const query = parse(listingQuerySchema, request.query);
  response.json({ data: await listAdminListings(query) });
}));
adminRouter.get('/admin/listings/:id', asyncRoute(async (request, response) => {
  await requireAdmin(request); const listingId = parse(id, request.params.id);
  response.json({ data: { listing: await adminListingDetail(listingId) } });
}));
adminRouter.post('/admin/listings/:id/hide', asyncRoute(async (request, response) => {
  const auth = await requireAdminCsrf(request); const listingId = parse(id, request.params.id); const body = parse(hideSchema, request.body);
  response.json({ data: { listing: await hideListing(auth.user._id, listingId, body.reason) } });
}));
