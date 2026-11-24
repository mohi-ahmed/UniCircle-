import mongoose from 'mongoose';
import { Category } from '../models/category.js';
import { Listing, PhotoAsset, RequestRecord, User } from '../models/core.js';
import { ApiError } from '../lib/http.js';
import { safeEqual, sign } from '../lib/security.js';

type ListingInput = { title: string; categoryId: string; description: string; condition: string; listingType: string;
  amountBdt?: string | undefined; exchangeTerms?: string | null | undefined; photoAssetId?: string | null | undefined };
type ListingLike = Record<string, unknown> & { _id: mongoose.Types.ObjectId; ownerId: mongoose.Types.ObjectId; categoryId: mongoose.Types.ObjectId;
  title: string; description: string; condition: string; listingType: string; amountPoisha: number | null; exchangeTerms: string | null;
  photo: null | { storageKey?: string; secureUrl?: string }; status: string; isHidden: boolean; hiddenReason: string | null;
  version: number; createdAt: Date; updatedAt: Date; deletedAt: Date | null };

export function parseAmount(value: string): number {
  const match = /^(0|[1-9][0-9]{0,6})\.([0-9]{2})$/.exec(value);
  if (!match) throw new ApiError(400, 'VALIDATION_ERROR', 'Listing details are invalid.', { fields: { amountBdt: 'Use a fixed two-decimal BDT amount.' } });
  const amount = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(amount) || amount > 999_999_999) throw new ApiError(400, 'VALIDATION_ERROR', 'Listing details are invalid.', { fields: { amountBdt: 'Amount is too large.' } });
  return amount;
}

export function validateListingTerms(input: ListingInput) {
  if (input.listingType === 'sell' || input.listingType === 'rent') {
    if (!input.amountBdt || parseAmount(input.amountBdt) <= 0 || input.exchangeTerms != null) throw new ApiError(400, 'VALIDATION_ERROR', 'Listing terms are invalid.');
    return { amountPoisha: parseAmount(input.amountBdt), exchangeTerms: null };
  }
  if (input.listingType === 'exchange') {
    if (!input.exchangeTerms?.trim() || input.amountBdt !== undefined) throw new ApiError(400, 'VALIDATION_ERROR', 'Listing terms are invalid.');
    return { amountPoisha: null, exchangeTerms: input.exchangeTerms.trim() };
  }
  if (input.amountBdt !== undefined && input.amountBdt !== '0.00') throw new ApiError(400, 'VALIDATION_ERROR', 'Free listings cannot have a price.');
  if (input.exchangeTerms != null) throw new ApiError(400, 'VALIDATION_ERROR', 'Free listings cannot have exchange terms.');
  return { amountPoisha: 0, exchangeTerms: null };
}

function amountBdt(amount: number | null): string | null { return amount === null ? null : `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, '0')}`; }

async function related(listings: ListingLike[]) {
  const [categories, owners] = await Promise.all([
    Category.find({ _id: { $in: listings.map(item => item.categoryId) } }).lean(),
    User.find({ _id: { $in: listings.map(item => item.ownerId) } }).lean(),
  ]);
  return { categories: new Map(categories.map(row => [row._id.toString(), row])), owners: new Map(owners.map(row => [row._id.toString(), row])) };
}

export async function serializeListings(listings: ListingLike[], viewerId: string, detail: boolean) {
  const maps = await related(listings);
  return listings.map(item => {
    const category = maps.categories.get(item.categoryId.toString());
    const owner = maps.owners.get(item.ownerId.toString());
    if (!category || !owner) throw new ApiError(500, 'INTERNAL', 'Unable to serialize listing.');
    const base = { id: item._id.toString(), title: item.title, category: { id: category._id.toString(), code: category.code, name: category.name },
      condition: item.condition, listingType: item.listingType, amountBdt: amountBdt(item.amountPoisha), exchangeTerms: item.exchangeTerms,
      photoUrl: item.photo?.secureUrl ?? null, owner: { id: owner._id.toString(), displayName: owner.displayName }, status: item.status,
      createdAt: item.createdAt.toISOString() };
    if (!detail) return base;
    return { ...base, description: item.description, version: item.version, isHidden: item.isHidden,
      ...(viewerId === item.ownerId.toString() ? { hiddenReason: item.hiddenReason } : {}), updatedAt: item.updatedAt.toISOString() };
  });
}

function cursor(filters: string, item: ListingLike): string {
  const payload = Buffer.from(JSON.stringify({ filters, createdAt: item.createdAt.toISOString(), id: item._id.toString() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readCursor(value: string, filters: string) {
  const at = value.lastIndexOf('.'); const payload = value.slice(0, at); const signature = value.slice(at + 1);
  if (at < 1 || !safeEqual(signature, sign(payload))) throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor is invalid.');
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { filters: string; createdAt: string; id: string };
    if (decoded.filters !== filters || !mongoose.isValidObjectId(decoded.id) || Number.isNaN(Date.parse(decoded.createdAt))) throw new Error();
    return decoded;
  } catch { throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor is invalid for these filters.'); }
}

export async function listFeed(viewerId: string, input: { q?: string | undefined; category?: string | undefined; type?: string | undefined; free?: boolean | undefined; limit: number; cursor?: string | undefined }) {
  const filterKey = JSON.stringify({ q: input.q ?? '', category: input.category ?? '', type: input.type ?? '', free: input.free ?? false });
  const query: Record<string, unknown> = { status: 'available', isHidden: false, deletedAt: null };
  if (input.q) query.$text = { $search: input.q };
  if (input.category) {
    const category = await Category.findOne({ code: input.category });
    if (!category) return { items: [], nextCursor: null };
    query.categoryId = category._id;
  }
  if (input.free) query.listingType = { $in: ['donate', 'free_borrowing'] }; else if (input.type) query.listingType = input.type;
  if (input.cursor) {
    const decoded = readCursor(input.cursor, filterKey); const date = new Date(decoded.createdAt); const id = new mongoose.Types.ObjectId(decoded.id);
    query.$and = [{ $or: [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: id } }] }];
  }
  const rows = await Listing.find(query).sort({ createdAt: -1, _id: -1 }).limit(input.limit + 1).lean() as unknown as ListingLike[];
  const hasMore = rows.length > input.limit; const page = rows.slice(0, input.limit);
  return { items: await serializeListings(page, viewerId, false), nextCursor: hasMore && page.length ? cursor(filterKey, page[page.length - 1]!) : null };
}

export async function listOwnListings(ownerId: mongoose.Types.ObjectId, input: { limit: number; cursor?: string | undefined }) {
  const filterKey = JSON.stringify({ ownerId: ownerId.toString() });
  const query: Record<string, unknown> = { ownerId, deletedAt: null };
  if (input.cursor) {
    const decoded = readCursor(input.cursor, filterKey); const date = new Date(decoded.createdAt); const id = new mongoose.Types.ObjectId(decoded.id);
    query.$or = [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: id } }];
  }
  const rows = await Listing.find(query).sort({ createdAt: -1, _id: -1 }).limit(input.limit + 1).lean() as unknown as ListingLike[];
  const hasMore = rows.length > input.limit; const page = rows.slice(0, input.limit);
  return { items: await serializeListings(page, ownerId.toString(), true),
    nextCursor: hasMore && page.length ? cursor(filterKey, page[page.length - 1]!) : null };
}

export async function listingDetail(id: string, viewerId: string) {
  const item = await Listing.findById(id).lean() as unknown as ListingLike | null;
  if (!item || item.deletedAt) throw new ApiError(404, 'NOT_FOUND', 'Listing was not found.');
  const visible = item.status === 'available' && !item.isHidden;
  const owner = item.ownerId.toString() === viewerId;
  const participant = await RequestRecord.exists({ listingId: item._id, requesterId: viewerId });
  if (!visible && !owner && !participant) throw new ApiError(404, 'NOT_FOUND', 'Listing was not found.');
  return (await serializeListings([item], viewerId, true))[0];
}

async function categoryExists(id: string, session?: mongoose.ClientSession) {
  if (!await Category.exists({ _id: id }).session(session ?? null)) throw new ApiError(400, 'VALIDATION_ERROR', 'Category is invalid.', { fields: { categoryId: 'Select a valid category.' } });
}

async function attachPhoto(photoAssetId: string | null | undefined, ownerId: mongoose.Types.ObjectId, listingId: mongoose.Types.ObjectId, session: mongoose.ClientSession) {
  if (!photoAssetId) return null;
  const asset = await PhotoAsset.findOneAndUpdate({ _id: photoAssetId, ownerId, status: 'verified', attachedListingId: null },
    { $set: { status: 'attached', attachedListingId: listingId } }, { new: true, session });
  if (!asset?.secureUrl) throw new ApiError(409, 'STATE_CONFLICT', 'Photo asset is unavailable or already attached.');
  return { storageKey: asset.storageKey, secureUrl: asset.secureUrl };
}

export async function createListing(ownerId: mongoose.Types.ObjectId, input: ListingInput) {
  await categoryExists(input.categoryId); const normalized = validateListingTerms(input); const id = new mongoose.Types.ObjectId();
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const photo = await attachPhoto(input.photoAssetId, ownerId, id, session);
    await Listing.create([{ _id: id, ownerId, title: input.title, categoryId: input.categoryId, description: input.description,
      condition: input.condition, listingType: input.listingType, ...normalized, photo }], { session });
  }); } finally { await session.endSession(); }
  return listingDetail(id.toString(), ownerId.toString());
}

export async function updateListing(ownerId: mongoose.Types.ObjectId, id: string, version: number, patch: Partial<ListingInput>) {
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const current = await Listing.findOne({ _id: id, ownerId }).session(session);
    if (!current) throw new ApiError(404, 'NOT_FOUND', 'Listing was not found.');
    if (current.version !== version) throw new ApiError(409, 'VERSION_MISMATCH', 'Listing changed. Reload and try again.');
    if (current.status !== 'available' || current.isHidden || current.deletedAt) throw new ApiError(409, 'STATE_CONFLICT', 'Listing cannot be edited in its current state.');
    if (patch.categoryId) await categoryExists(patch.categoryId, session);
    const merged: ListingInput = { title: patch.title ?? current.title, categoryId: patch.categoryId ?? current.categoryId.toString(),
      description: patch.description ?? current.description, condition: patch.condition ?? current.condition, listingType: patch.listingType ?? current.listingType,
      ...(patch.amountBdt !== undefined ? { amountBdt: patch.amountBdt } : current.amountPoisha !== null ? { amountBdt: amountBdt(current.amountPoisha) as string } : {}),
      ...(patch.exchangeTerms !== undefined ? { exchangeTerms: patch.exchangeTerms } : { exchangeTerms: current.exchangeTerms }) };
    if (merged.listingType === 'exchange') delete merged.amountBdt; else merged.exchangeTerms = null;
    const normalized = validateListingTerms(merged);
    const termsChanged = merged.listingType !== current.listingType || normalized.amountPoisha !== current.amountPoisha || normalized.exchangeTerms !== current.exchangeTerms;
    let photo = current.photo;
    if (patch.photoAssetId !== undefined) {
      await PhotoAsset.updateMany({ ownerId, attachedListingId: current._id }, { $set: { status: 'verified', attachedListingId: null } }, { session });
      photo = patch.photoAssetId === null ? null : await attachPhoto(patch.photoAssetId, ownerId, current._id, session);
    }
    await Listing.updateOne({ _id: current._id, version }, { $set: { title: merged.title, categoryId: merged.categoryId, description: merged.description,
      condition: merged.condition, listingType: merged.listingType, ...normalized, photo }, $inc: { version: 1, mutationVersion: 1 } }, { session });
    if (termsChanged) await RequestRecord.updateMany({ listingId: current._id, status: 'pending' }, { $set: { status: 'cancelled', cancellationReason: 'listing_terms_changed' } }, { session });
  }); } finally { await session.endSession(); }
  return listingDetail(id, ownerId.toString());
}

export async function closeOrDelete(ownerId: mongoose.Types.ObjectId, id: string, remove: boolean) {
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const update = remove ? { $set: { deletedAt: new Date(), deletedBy: ownerId }, $inc: { version: 1, mutationVersion: 1 } }
      : { $set: { status: 'closed' }, $inc: { mutationVersion: 1 } };
    const result = await Listing.updateOne({ _id: id, ownerId, status: 'available', isHidden: false, deletedAt: null }, update, { session });
    if (result.matchedCount !== 1) {
      if (!await Listing.exists({ _id: id, ownerId }).session(session)) throw new ApiError(404, 'NOT_FOUND', 'Listing was not found.');
      throw new ApiError(409, 'STATE_CONFLICT', 'Listing cannot be changed in its current state.');
    }
    await RequestRecord.updateMany({ listingId: id, status: 'pending' }, { $set: { status: 'cancelled', cancellationReason: remove ? 'listing_deleted' : 'listing_closed' } }, { session });
  }); } finally { await session.endSession(); }
  return remove ? null : listingDetail(id, ownerId.toString());
}
