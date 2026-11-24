import { Router, type RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { ApiError } from '../lib/http.js';
import { requireVerified, requireVerifiedCsrf } from '../middleware/auth.js';
import { acceptRequest, cancelRequest, createRequest, declineRequest, handoverRequest, listRequests, requestDetail, returnRequest } from '../services/requests.js';

export const requestsRouter = Router();
const id = z.string().regex(/^[a-f0-9]{24}$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createSchema = z.union([
  z.object({}).strict(),
  z.object({ proposedPickupDate: date, returnDate: date }).strict(),
  z.object({ offeredItemDescription: z.string().trim().min(1).max(500) }).strict(),
]);
const acceptSchema = z.object({ pickupPoint: z.string().trim().min(3).max(120), pickupAt: z.string().datetime({ offset: true }) }).strict();
const cancelSchema = z.object({ reason: z.string().trim().min(3).max(500).optional() }).strict();
const handoverSchema = z.union([z.object({}).strict(), z.object({ confirmBothItemsExchanged: z.literal(true) }).strict()]);
const pageSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().optional() }).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  try { return schema.parse(value); } catch (error) {
    if (!(error instanceof ZodError)) throw error;
    const fields: Record<string, string> = {};
    for (const issue of error.issues) fields[String(issue.path[0] ?? 'body')] = issue.message;
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', { fields });
  }
}
function asyncRoute(handler: RequestHandler): RequestHandler { return (request, response, next) => { Promise.resolve(handler(request, response, next)).catch(next); }; }

requestsRouter.post('/listings/:id/requests', asyncRoute(async (request, response) => {
  const auth = await requireVerifiedCsrf(request); const listingId = parse(id, request.params.id); const body = parse(createSchema, request.body ?? {});
  response.status(201).json({ data: { request: await createRequest(auth.user._id, listingId, body) } });
}));
requestsRouter.get('/requests/:id', asyncRoute(async (request, response) => {
  const auth = await requireVerified(request); const requestId = parse(id, request.params.id);
  response.json({ data: { request: await requestDetail(requestId, auth.user._id) } });
}));
requestsRouter.post('/requests/:id/accept', asyncRoute(async (request, response) => {
  const auth = await requireVerifiedCsrf(request); const requestId = parse(id, request.params.id); const body = parse(acceptSchema, request.body);
  response.json({ data: await acceptRequest(auth.user._id, requestId, body.pickupPoint, new Date(body.pickupAt)) });
}));
requestsRouter.post('/requests/:id/decline', asyncRoute(async (request, response) => {
  const auth = await requireVerifiedCsrf(request); const requestId = parse(id, request.params.id); parse(z.object({}).strict(), request.body ?? {});
  response.json({ data: { request: await declineRequest(auth.user._id, requestId) } });
}));
requestsRouter.post('/requests/:id/cancel', asyncRoute(async (request, response) => {
  const auth = await requireVerifiedCsrf(request); const requestId = parse(id, request.params.id); const body = parse(cancelSchema, request.body ?? {});
  response.json({ data: { request: await cancelRequest(auth.user._id, requestId, body.reason) } });
}));
requestsRouter.post('/requests/:id/handover', asyncRoute(async (request, response) => {
  const auth = await requireVerifiedCsrf(request); const requestId = parse(id, request.params.id); const body = parse(handoverSchema, request.body ?? {});
  response.json({ data: await handoverRequest(auth.user._id, requestId, 'confirmBothItemsExchanged' in body) });
}));
requestsRouter.post('/requests/:id/return', asyncRoute(async (request, response) => {
  const auth = await requireVerifiedCsrf(request); const requestId = parse(id, request.params.id); parse(z.object({}).strict(), request.body ?? {});
  response.json({ data: await returnRequest(auth.user._id, requestId) });
}));
requestsRouter.get('/me/requests/sent', asyncRoute(async (request, response) => {
  const auth = await requireVerified(request); const query = parse(pageSchema, request.query);
  response.json({ data: await listRequests(auth.user._id, 'sent', query.limit, query.cursor) });
}));
requestsRouter.get('/me/requests/received', asyncRoute(async (request, response) => {
  const auth = await requireVerified(request); const query = parse(pageSchema, request.query);
  response.json({ data: await listRequests(auth.user._id, 'received', query.limit, query.cursor) });
}));
