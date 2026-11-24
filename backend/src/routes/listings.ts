import { Router, type RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { CONDITIONS, LISTING_TYPES } from '../constants.js';
import { ApiError } from '../lib/http.js';
import { requireVerified, requireVerifiedCsrf } from '../middleware/auth.js';
import { Category } from '../models/category.js';
import { closeOrDelete, createListing, listFeed, listOwnListings, listingDetail, updateListing } from '../services/listings.js';
import { confirmPhoto, signPhoto } from '../services/photos.js';

export const listingsRouter = Router();
const id = z.string().regex(/^[a-f0-9]{24}$/);
const amount = z.string().regex(/^(0|[1-9][0-9]{0,6})\.[0-9]{2}$/);
const base = { title: z.string().trim().min(3).max(100), categoryId: id, description: z.string().trim().min(10).max(2000),
  condition: z.enum(CONDITIONS), listingType: z.enum(LISTING_TYPES), amountBdt: amount.optional(),
  exchangeTerms: z.string().trim().min(1).max(500).nullable().optional(), photoAssetId: id.nullable().optional() };
const createSchema = z.object(base).strict();
const patchSchema = z.object({ version: z.number().int().min(1), ...Object.fromEntries(Object.entries(base).map(([key, value]) => [key, value.optional()])) }).strict()
  .refine(value => Object.keys(value).some(key => key !== 'version'), { message: 'At least one mutable field is required.' });
const querySchema = z.object({ q: z.string().trim().max(100).optional(), category: z.string().optional(), type: z.enum(LISTING_TYPES).optional(),
  free: z.enum(['true', 'false']).transform(value => value === 'true').optional(), limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().optional() }).strict()
  .refine(value => !(value.free && value.type), { message: 'free and type cannot be combined.' });
const photoSignSchema = z.object({ fileName: z.string().min(1).max(255), contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']), sizeBytes: z.number().int().min(1).max(5_242_880) }).strict();
const photoConfirmSchema = z.object({ photoAssetId: id }).strict();
const activityPageSchema = z.object({ limit: z.coerce.number().int().min(1).max(50).default(20), cursor: z.string().optional() }).strict();

function parse<T>(schema: z.ZodType<T>, value: unknown): T { try { return schema.parse(value); } catch (error) {
  if (!(error instanceof ZodError)) throw error; const fields: Record<string, string> = {};
  for (const issue of error.issues) fields[String(issue.path[0] ?? 'body')] = issue.message;
  throw new ApiError(400, 'VALIDATION_ERROR', 'Request validation failed.', { fields });
} }
function asyncRoute(handler: RequestHandler): RequestHandler { return (request, response, next) => { Promise.resolve(handler(request, response, next)).catch(next); }; }

listingsRouter.get('/categories', asyncRoute(async (request, response) => { await requireVerified(request);
  const rows = await Category.find().sort({ name: 1 }).lean(); response.json({ data: { items: rows.map(row => ({ id: row._id.toString(), code: row.code, name: row.name })) } }); }));
listingsRouter.get('/listings', asyncRoute(async (request, response) => { const auth = await requireVerified(request); const query = parse(querySchema, request.query);
  response.json({ data: await listFeed(auth.user._id.toString(), query) }); }));
listingsRouter.get('/me/listings', asyncRoute(async (request, response) => { const auth = await requireVerified(request); const query = parse(activityPageSchema, request.query);
  response.json({ data: await listOwnListings(auth.user._id, query) }); }));
listingsRouter.get('/listings/:id', asyncRoute(async (request, response) => { const auth = await requireVerified(request); const listingId = parse(id, request.params.id);
  response.json({ data: { listing: await listingDetail(listingId, auth.user._id.toString()) } }); }));
listingsRouter.post('/listings', asyncRoute(async (request, response) => { const auth = await requireVerifiedCsrf(request); const body = parse(createSchema, request.body);
  response.status(201).json({ data: { listing: await createListing(auth.user._id, body) } }); }));
listingsRouter.patch('/listings/:id', asyncRoute(async (request, response) => { const auth = await requireVerifiedCsrf(request); const listingId = parse(id, request.params.id); const body = parse(patchSchema, request.body);
  const { version, ...patch } = body; response.json({ data: { listing: await updateListing(auth.user._id, listingId, version, patch) } }); }));
listingsRouter.post('/listings/:id/close', asyncRoute(async (request, response) => { const auth = await requireVerifiedCsrf(request); const listingId = parse(id, request.params.id); parse(z.object({}).strict(), request.body ?? {});
  response.json({ data: { listing: await closeOrDelete(auth.user._id, listingId, false) } }); }));
listingsRouter.delete('/listings/:id', asyncRoute(async (request, response) => { const auth = await requireVerifiedCsrf(request); const listingId = parse(id, request.params.id);
  await closeOrDelete(auth.user._id, listingId, true); response.status(204).end(); }));
listingsRouter.post('/listings/photos/sign', asyncRoute(async (request, response) => { const auth = await requireVerifiedCsrf(request); const body = parse(photoSignSchema, request.body);
  response.json({ data: { upload: await signPhoto(auth.user._id, body) } }); }));
listingsRouter.post('/listings/photos/confirm', asyncRoute(async (request, response) => { const auth = await requireVerifiedCsrf(request); const body = parse(photoConfirmSchema, request.body);
  response.json({ data: { photo: await confirmPhoto(auth.user._id, body.photoAssetId) } }); }));
