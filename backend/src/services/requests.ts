import mongoose from 'mongoose';
import { ApiError } from '../lib/http.js';
import { safeEqual, sign } from '../lib/security.js';
import { Listing, RequestRecord, User } from '../models/core.js';

const ACTIVE_REQUEST_STATUSES = ['pending', 'accepted', 'checked_out'] as const;
const TEMPORARY_TYPES = new Set(['rent', 'free_borrowing']);
const MAX_AMOUNT_POISHA = 999_999_999;

type CreateRequestInput = {
  proposedPickupDate?: string | undefined;
  returnDate?: string | undefined;
  offeredItemDescription?: string | undefined;
};

type RequestLike = {
  _id: mongoose.Types.ObjectId;
  listingId: mongoose.Types.ObjectId;
  requesterId: mongoose.Types.ObjectId;
  status: string;
  listingType: string;
  termsAmountPoisha: number | null;
  listingExchangeTerms: string | null;
  proposedPickupDate: string | null;
  returnDate: string | null;
  rentalFeePoisha: number | null;
  offeredItemDescription: string | null;
  pickupPoint: string | null;
  pickupAt: Date | null;
  handedOverAt: Date | null;
  returnedAt: Date | null;
  cancellationReason: string | null;
  createdAt: Date;
};

type ListingLike = {
  _id: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  listingType: string;
  amountPoisha: number | null;
  exchangeTerms: string | null;
  status: string;
  isHidden: boolean;
  deletedAt: Date | null;
  mutationVersion: number;
};

function amountBdt(amount: number | null): string | null {
  return amount === null ? null : `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`;
}

export function campusDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function dateDay(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError(400, 'VALIDATION_ERROR', 'Request terms are invalid.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Request terms are invalid.');
  }
  return Math.floor(date.getTime() / 86_400_000);
}

export function requestTerms(listing: Pick<ListingLike, 'listingType' | 'amountPoisha' | 'exchangeTerms'>, input: CreateRequestInput, now = new Date()) {
  if (TEMPORARY_TYPES.has(listing.listingType)) {
    if (!input.proposedPickupDate || !input.returnDate || input.offeredItemDescription !== undefined) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Pickup and return dates are required for this listing.');
    }
    const pickup = dateDay(input.proposedPickupDate);
    const returned = dateDay(input.returnDate);
    const days = returned - pickup;
    if (input.proposedPickupDate < campusDate(now) || days < 1 || days > 365) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Request dates are invalid.', { fields: { returnDate: 'Return must be 1 to 365 campus days after a non-past pickup date.' } });
    }
    const rentalFeePoisha = listing.listingType === 'rent' ? (listing.amountPoisha ?? 0) * days : null;
    if (!Number.isSafeInteger(rentalFeePoisha) || (rentalFeePoisha ?? 0) > MAX_AMOUNT_POISHA) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Rental fee exceeds the permitted maximum.', { fields: { returnDate: 'Choose a shorter rental period.' } });
    }
    return { proposedPickupDate: input.proposedPickupDate, returnDate: input.returnDate, rentalFeePoisha,
      offeredItemDescription: null };
  }
  if (listing.listingType === 'exchange') {
    const offer = input.offeredItemDescription?.trim();
    if (!offer || input.proposedPickupDate !== undefined || input.returnDate !== undefined) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'An offered item description is required for exchange.');
    }
    return { proposedPickupDate: null, returnDate: null, rentalFeePoisha: null, offeredItemDescription: offer };
  }
  if (Object.keys(input).length !== 0) throw new ApiError(400, 'VALIDATION_ERROR', 'Sell and donate requests require an empty body.');
  return { proposedPickupDate: null, returnDate: null, rentalFeePoisha: null, offeredItemDescription: null };
}

async function serialize(rows: RequestLike[]) {
  const users = await User.find({ _id: { $in: rows.map(row => row.requesterId) } }).lean();
  const byId = new Map(users.map(user => [user._id.toString(), user]));
  return rows.map(row => {
    const requester = byId.get(row.requesterId.toString());
    if (!requester) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to serialize request.');
    return {
      id: row._id.toString(), listingId: row.listingId.toString(),
      requester: { id: requester._id.toString(), displayName: requester.displayName },
      listingType: row.listingType, status: row.status, termsAmountBdt: amountBdt(row.termsAmountPoisha),
      listingExchangeTerms: row.listingExchangeTerms, proposedPickupDate: row.proposedPickupDate,
      returnDate: row.returnDate, rentalFeeBdt: amountBdt(row.rentalFeePoisha),
      offeredItemDescription: row.offeredItemDescription, pickupPoint: row.pickupPoint, pickupAt: row.pickupAt?.toISOString() ?? null,
      handedOverAt: row.handedOverAt?.toISOString() ?? null, returnedAt: row.returnedAt?.toISOString() ?? null,
      cancellationReason: row.cancellationReason, createdAt: row.createdAt.toISOString(),
    };
  });
}

async function serializedById(id: mongoose.Types.ObjectId | string) {
  const row = await RequestRecord.findById(id).lean() as unknown as RequestLike | null;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
  return (await serialize([row]))[0]!;
}

function duplicateConflict(error: unknown): never {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const labelled = error && typeof error === 'object' && 'hasErrorLabel' in error && typeof error.hasErrorLabel === 'function'
    ? error.hasErrorLabel('TransientTransactionError') : false;
  if (code === 11000 || code === 112 || code === 251 || labelled) {
    throw new ApiError(409, 'STATE_CONFLICT', 'An active request already exists or this listing was already reserved.');
  }
  throw error;
}

export async function createRequest(requesterId: mongoose.Types.ObjectId, listingId: string, input: CreateRequestInput) {
  const session = await mongoose.startSession();
  const requestId = new mongoose.Types.ObjectId();
  try {
    await session.withTransaction(async () => {
      const listing = await Listing.findById(listingId).session(session) as unknown as ListingLike | null;
      if (!listing || listing.deletedAt || listing.isHidden) throw new ApiError(404, 'NOT_FOUND', 'Listing was not found.');
      if (listing.ownerId.equals(requesterId)) throw new ApiError(403, 'FORBIDDEN', 'Owners cannot request their own listing.');
      if (listing.status !== 'available') throw new ApiError(409, 'STATE_CONFLICT', 'Listing is no longer available.');
      if (await RequestRecord.exists({ listingId: listing._id, requesterId, status: { $in: ACTIVE_REQUEST_STATUSES } }).session(session)) {
        throw new ApiError(409, 'STATE_CONFLICT', 'An active request already exists for this listing.');
      }
      const terms = requestTerms(listing, input);
      const guarded = await Listing.updateOne({ _id: listing._id, status: 'available', isHidden: false, deletedAt: null,
        mutationVersion: listing.mutationVersion }, { $inc: { mutationVersion: 1 } }, { session });
      if (guarded.modifiedCount !== 1) throw new ApiError(409, 'STATE_CONFLICT', 'Listing changed. Reload and try again.');
      await RequestRecord.create([{ _id: requestId, listingId: listing._id, requesterId, status: 'pending',
        listingType: listing.listingType, termsAmountPoisha: listing.amountPoisha, listingExchangeTerms: listing.exchangeTerms, ...terms }], { session });
    });
  } catch (error) { duplicateConflict(error); } finally { await session.endSession(); }
  return serializedById(requestId);
}

async function participant(id: string, viewerId: mongoose.Types.ObjectId) {
  const request = await RequestRecord.findById(id).lean() as unknown as RequestLike | null;
  if (!request) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
  const listing = await Listing.findById(request.listingId).lean() as unknown as ListingLike | null;
  if (!listing) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
  if (!request.requesterId.equals(viewerId) && !listing.ownerId.equals(viewerId)) throw new ApiError(403, 'FORBIDDEN', 'Request access is restricted to its participants.');
  return request;
}

export async function requestDetail(id: string, viewerId: mongoose.Types.ObjectId) {
  const request = await participant(id, viewerId);
  return (await serialize([request]))[0]!;
}

export async function acceptRequest(ownerId: mongoose.Types.ObjectId, id: string, pickupPoint: string, pickupAt: Date) {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const request = await RequestRecord.findById(id).session(session) as unknown as RequestLike | null;
      if (!request) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
      const listing = await Listing.findById(request.listingId).session(session) as unknown as ListingLike | null;
      if (!listing) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
      if (!listing.ownerId.equals(ownerId)) throw new ApiError(403, 'FORBIDDEN', 'Only the listing owner can accept this request.');
      if (request.status !== 'pending') throw new ApiError(409, 'STATE_CONFLICT', 'Request is no longer pending.');
      if (pickupAt.getTime() < Date.now() || (TEMPORARY_TYPES.has(request.listingType) && campusDate(pickupAt) !== request.proposedPickupDate)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Pickup time is invalid.', { fields: { pickupAt: 'Use a non-past time on the proposed campus date.' } });
      }
      const reserved = await Listing.updateOne({ _id: listing._id, ownerId, status: 'available', isHidden: false, deletedAt: null,
        mutationVersion: listing.mutationVersion }, { $set: { status: 'reserved' }, $inc: { mutationVersion: 1 } }, { session });
      if (reserved.modifiedCount !== 1) throw new ApiError(409, 'STATE_CONFLICT', 'Listing is no longer available.');
      const accepted = await RequestRecord.updateOne({ _id: request._id, status: 'pending' },
        { $set: { status: 'accepted', pickupPoint, pickupAt } }, { session });
      if (accepted.modifiedCount !== 1) throw new ApiError(409, 'STATE_CONFLICT', 'Request is no longer pending.');
      await RequestRecord.updateMany({ listingId: listing._id, _id: { $ne: request._id }, status: 'pending' },
        { $set: { status: 'declined' } }, { session });
    });
  } catch (error) { duplicateConflict(error); } finally { await session.endSession(); }
  return { request: await serializedById(id), listingStatus: 'reserved' as const };
}

export async function declineRequest(ownerId: mongoose.Types.ObjectId, id: string) {
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const request = await RequestRecord.findById(id).session(session) as unknown as RequestLike | null;
    if (!request) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
    const listing = await Listing.findById(request.listingId).session(session) as unknown as ListingLike | null;
    if (!listing) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
    if (!listing.ownerId.equals(ownerId)) throw new ApiError(403, 'FORBIDDEN', 'Only the listing owner can decline this request.');
    const result = await RequestRecord.updateOne({ _id: request._id, status: 'pending' }, { $set: { status: 'declined' } }, { session });
    if (result.modifiedCount !== 1) throw new ApiError(409, 'STATE_CONFLICT', 'Request is no longer pending.');
  }); } finally { await session.endSession(); }
  return serializedById(id);
}

export async function cancelRequest(viewerId: mongoose.Types.ObjectId, id: string, reason?: string) {
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const request = await RequestRecord.findById(id).session(session) as unknown as RequestLike | null;
    if (!request) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
    const listing = await Listing.findById(request.listingId).session(session) as unknown as ListingLike | null;
    if (!listing) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
    const requester = request.requesterId.equals(viewerId); const owner = listing.ownerId.equals(viewerId);
    if (request.status === 'pending') {
      if (!requester) throw new ApiError(403, 'FORBIDDEN', 'Only the requester can cancel a pending request.');
    } else if (request.status === 'accepted') {
      if (!requester && !owner) throw new ApiError(403, 'FORBIDDEN', 'Only a participant can cancel an accepted request.');
      const reopened = await Listing.updateOne({ _id: listing._id, status: 'reserved', mutationVersion: listing.mutationVersion },
        { $set: { status: 'available' }, $inc: { mutationVersion: 1 } }, { session });
      if (reopened.modifiedCount !== 1) throw new ApiError(409, 'STATE_CONFLICT', 'Listing state changed. Reload and try again.');
    } else throw new ApiError(409, 'STATE_CONFLICT', 'Request cannot be cancelled in its current state.');
    const cancelled = await RequestRecord.updateOne({ _id: request._id, status: request.status },
      { $set: { status: 'cancelled', cancellationReason: reason?.trim() || null } }, { session });
    if (cancelled.modifiedCount !== 1) throw new ApiError(409, 'STATE_CONFLICT', 'Request state changed. Reload and try again.');
  }); } finally { await session.endSession(); }
  return serializedById(id);
}

export async function handoverRequest(ownerId: mongoose.Types.ObjectId, id: string, confirmExchange: boolean) {
  const session = await mongoose.startSession(); let listingStatus: 'checked_out' | 'completed' = 'completed';
  try { await session.withTransaction(async () => {
    const request = await RequestRecord.findById(id).session(session) as unknown as RequestLike | null;
    if (!request) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
    const listing = await Listing.findById(request.listingId).session(session) as unknown as ListingLike | null;
    if (!listing) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
    if (!listing.ownerId.equals(ownerId)) throw new ApiError(403, 'FORBIDDEN', 'Only the listing owner can record handover.');
    if (request.status !== 'accepted' || listing.status !== 'reserved') throw new ApiError(409, 'STATE_CONFLICT', 'Handover is not available in the current state.');
    if (request.listingType === 'exchange' && !confirmExchange) throw new ApiError(400, 'VALIDATION_ERROR', 'Confirm that both items were exchanged.');
    if (request.listingType !== 'exchange' && confirmExchange) throw new ApiError(400, 'VALIDATION_ERROR', 'Exchange confirmation is not valid for this listing type.');
    listingStatus = TEMPORARY_TYPES.has(request.listingType) ? 'checked_out' : 'completed';
    const listingResult = await Listing.updateOne({ _id: listing._id, status: 'reserved', mutationVersion: listing.mutationVersion },
      { $set: { status: listingStatus }, $inc: { mutationVersion: 1 } }, { session });
    if (listingResult.modifiedCount !== 1) throw new ApiError(409, 'STATE_CONFLICT', 'Listing state changed. Reload and try again.');
    const requestResult = await RequestRecord.updateOne({ _id: request._id, status: 'accepted' },
      { $set: { status: listingStatus === 'checked_out' ? 'checked_out' : 'completed', handedOverAt: new Date() } }, { session });
    if (requestResult.modifiedCount !== 1) throw new ApiError(409, 'STATE_CONFLICT', 'Request state changed. Reload and try again.');
  }); } finally { await session.endSession(); }
  return { request: await serializedById(id), listingStatus };
}

export async function returnRequest(ownerId: mongoose.Types.ObjectId, id: string) {
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const request = await RequestRecord.findById(id).session(session) as unknown as RequestLike | null;
    if (!request) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
    const listing = await Listing.findById(request.listingId).session(session) as unknown as ListingLike | null;
    if (!listing) throw new ApiError(404, 'NOT_FOUND', 'Request was not found.');
    if (!listing.ownerId.equals(ownerId)) throw new ApiError(403, 'FORBIDDEN', 'Only the listing owner can confirm return.');
    if (!TEMPORARY_TYPES.has(request.listingType) || request.status !== 'checked_out' || listing.status !== 'checked_out') {
      throw new ApiError(409, 'STATE_CONFLICT', 'Return is not available in the current state.');
    }
    const listingResult = await Listing.updateOne({ _id: listing._id, status: 'checked_out', mutationVersion: listing.mutationVersion },
      { $set: { status: 'available' }, $inc: { mutationVersion: 1 } }, { session });
    if (listingResult.modifiedCount !== 1) throw new ApiError(409, 'STATE_CONFLICT', 'Listing state changed. Reload and try again.');
    const requestResult = await RequestRecord.updateOne({ _id: request._id, status: 'checked_out' },
      { $set: { status: 'completed', returnedAt: new Date() } }, { session });
    if (requestResult.modifiedCount !== 1) throw new ApiError(409, 'STATE_CONFLICT', 'Request state changed. Reload and try again.');
  }); } finally { await session.endSession(); }
  return { request: await serializedById(id), listingStatus: 'available' as const };
}

function pageCursor(scope: string, row: RequestLike): string {
  const payload = Buffer.from(JSON.stringify({ scope, createdAt: row.createdAt.toISOString(), id: row._id.toString() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readPageCursor(value: string, scope: string) {
  const index = value.lastIndexOf('.'); const payload = value.slice(0, index); const signature = value.slice(index + 1);
  if (index < 1 || !safeEqual(signature, sign(payload))) throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor is invalid.');
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { scope: string; createdAt: string; id: string };
    if (decoded.scope !== scope || !mongoose.isValidObjectId(decoded.id) || Number.isNaN(Date.parse(decoded.createdAt))) throw new Error();
    return decoded;
  } catch { throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor is invalid for this activity list.'); }
}

export async function listRequests(viewerId: mongoose.Types.ObjectId, direction: 'sent' | 'received', limit: number, cursor?: string) {
  const query: Record<string, unknown> = direction === 'sent' ? { requesterId: viewerId }
    : { listingId: { $in: await Listing.find({ ownerId: viewerId }).distinct('_id') } };
  if (cursor) {
    const decoded = readPageCursor(cursor, direction); const date = new Date(decoded.createdAt); const objectId = new mongoose.Types.ObjectId(decoded.id);
    query.$or = [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: objectId } }];
  }
  const rows = await RequestRecord.find(query).sort({ createdAt: -1, _id: -1 }).limit(limit + 1).lean() as unknown as RequestLike[];
  const hasMore = rows.length > limit; const page = rows.slice(0, limit);
  return { items: await serialize(page), nextCursor: hasMore && page.length ? pageCursor(direction, page[page.length - 1]!) : null };
}
