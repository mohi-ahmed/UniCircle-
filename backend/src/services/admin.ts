import mongoose from 'mongoose';
import { LISTING_STATUSES } from '../constants.js';
import { ApiError } from '../lib/http.js';
import { safeEqual, sign } from '../lib/security.js';
import { ApprovedEmailDomain } from '../models/approved-email-domain.js';
import { Listing, ModerationAction, RequestRecord, User } from '../models/core.js';

type AdminListingLike = {
  _id: mongoose.Types.ObjectId;
  ownerId: mongoose.Types.ObjectId;
  title: string;
  listingType: string;
  status: string;
  isHidden: boolean;
  hiddenReason: string | null;
  deletedAt: Date | null;
  mutationVersion: number;
  createdAt: Date;
};

type AdminListInput = {
  q?: string | undefined;
  status?: typeof LISTING_STATUSES[number] | undefined;
  hidden?: boolean | undefined;
  limit: number;
  cursor?: string | undefined;
};

export function normalizeDomain(value: string): string {
  const domain = value.trim().toLowerCase();
  if (domain.length < 3 || domain.length > 253 || domain.includes('@') || !domain.includes('.')) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Domain is invalid.', { fields: { domain: 'Enter a valid official domain.' } });
  }
  const labels = domain.split('.');
  if (labels.some(label => !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Domain is invalid.', { fields: { domain: 'Enter a normalized ASCII domain without wildcards or URLs.' } });
  }
  return domain;
}

function domainDto(row: { _id: mongoose.Types.ObjectId; domain: string; isActive: boolean; createdAt: Date; updatedAt: Date }) {
  return { id: row._id.toString(), domain: row.domain, isActive: row.isActive,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function listDomains() {
  const rows = await ApprovedEmailDomain.find().sort({ domain: 1 }).lean();
  return rows.map(domainDto);
}

function mapDuplicate(error: unknown): never {
  if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
    throw new ApiError(409, 'DOMAIN_ALREADY_EXISTS', 'That approved email domain already exists.');
  }
  throw error;
}

export async function addDomain(adminId: mongoose.Types.ObjectId, value: string) {
  const domain = normalizeDomain(value); const domainId = new mongoose.Types.ObjectId();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await ApprovedEmailDomain.create([{ _id: domainId, domain, isActive: true, createdBy: adminId, updatedBy: adminId }], { session });
      await ModerationAction.create([{ adminId, actionType: 'domain.add', targetType: 'approved_email_domain', targetId: domainId,
        metadata: { domain, isActive: true } }], { session });
    });
  } catch (error) { mapDuplicate(error); } finally { await session.endSession(); }
  const created = await ApprovedEmailDomain.findById(domainId).lean();
  if (!created) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to read the approved domain.');
  return domainDto(created);
}

export async function setDomainActive(adminId: mongoose.Types.ObjectId, id: string, isActive: boolean) {
  const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const domain = await ApprovedEmailDomain.findByIdAndUpdate(id, { $set: { isActive, updatedBy: adminId } },
      { new: true, session, runValidators: true });
    if (!domain) throw new ApiError(404, 'NOT_FOUND', 'Approved email domain was not found.');
    await ModerationAction.create([{ adminId, actionType: isActive ? 'domain.activate' : 'domain.deactivate',
      targetType: 'approved_email_domain', targetId: domain._id, metadata: { domain: domain.domain, isActive } }], { session });
  }); } finally { await session.endSession(); }
  const updated = await ApprovedEmailDomain.findById(id).lean();
  if (!updated) throw new ApiError(404, 'NOT_FOUND', 'Approved email domain was not found.');
  return domainDto(updated);
}

async function adminListingDtos(rows: AdminListingLike[]) {
  const owners = await User.find({ _id: { $in: rows.map(row => row.ownerId) } }).lean();
  const byId = new Map(owners.map(owner => [owner._id.toString(), owner]));
  return rows.map(row => {
    const owner = byId.get(row.ownerId.toString());
    if (!owner) throw new ApiError(500, 'INTERNAL_ERROR', 'Unable to serialize moderation listing.');
    return { id: row._id.toString(), title: row.title, listingType: row.listingType, status: row.status,
      isHidden: row.isHidden, hiddenReason: row.hiddenReason, owner: { id: owner._id.toString(), displayName: owner.displayName },
      createdAt: row.createdAt.toISOString() };
  });
}

function cursor(scope: string, row: AdminListingLike): string {
  const payload = Buffer.from(JSON.stringify({ scope, createdAt: row.createdAt.toISOString(), id: row._id.toString() })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readCursor(value: string, scope: string) {
  const index = value.lastIndexOf('.'); const payload = value.slice(0, index); const signature = value.slice(index + 1);
  if (index < 1 || !safeEqual(signature, sign(payload))) throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor is invalid.');
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { scope: string; createdAt: string; id: string };
    if (decoded.scope !== scope || !mongoose.isValidObjectId(decoded.id) || Number.isNaN(Date.parse(decoded.createdAt))) throw new Error();
    return decoded;
  } catch { throw new ApiError(400, 'VALIDATION_ERROR', 'Cursor is invalid for these moderation filters.'); }
}

export async function listAdminListings(input: AdminListInput) {
  const scope = JSON.stringify({ q: input.q ?? '', status: input.status ?? '', hidden: input.hidden ?? null });
  const query: Record<string, unknown> = { deletedAt: null };
  if (input.q) query.$text = { $search: input.q };
  if (input.status) query.status = input.status;
  if (input.hidden !== undefined) query.isHidden = input.hidden;
  if (input.cursor) {
    const decoded = readCursor(input.cursor, scope); const date = new Date(decoded.createdAt); const id = new mongoose.Types.ObjectId(decoded.id);
    query.$and = [{ $or: [{ createdAt: { $lt: date } }, { createdAt: date, _id: { $lt: id } }] }];
  }
  const rows = await Listing.find(query).sort({ createdAt: -1, _id: -1 }).limit(input.limit + 1).lean() as unknown as AdminListingLike[];
  const hasMore = rows.length > input.limit; const page = rows.slice(0, input.limit);
  return { items: await adminListingDtos(page), nextCursor: hasMore && page.length ? cursor(scope, page[page.length - 1]!) : null };
}

export async function adminListingDetail(id: string) {
  const row = await Listing.findOne({ _id: id, deletedAt: null }).lean() as unknown as AdminListingLike | null;
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Listing was not found.');
  return (await adminListingDtos([row]))[0]!;
}

export async function hideListing(adminId: mongoose.Types.ObjectId, id: string, reasonValue: string) {
  const reason = reasonValue.trim(); const session = await mongoose.startSession();
  try { await session.withTransaction(async () => {
    const listing = await Listing.findOne({ _id: id, deletedAt: null }).session(session) as unknown as AdminListingLike | null;
    if (!listing) throw new ApiError(404, 'NOT_FOUND', 'Listing was not found.');
    if (listing.isHidden) throw new ApiError(409, 'STATE_CONFLICT', 'Listing is already hidden.');
    const nextStatus = listing.status === 'reserved' ? 'available' : listing.status;
    const result = await Listing.updateOne({ _id: listing._id, isHidden: false, deletedAt: null, mutationVersion: listing.mutationVersion },
      { $set: { isHidden: true, hiddenReason: reason, hiddenAt: new Date(), hiddenBy: adminId, status: nextStatus },
        $inc: { mutationVersion: 1 } }, { session });
    if (result.modifiedCount !== 1) throw new ApiError(409, 'STATE_CONFLICT', 'Listing changed. Reload and try again.');
    if (listing.status === 'reserved') {
      await RequestRecord.updateMany({ listingId: listing._id, status: { $in: ['pending', 'accepted'] } },
        { $set: { status: 'cancelled', cancellationReason: 'listing_hidden' } }, { session });
    } else if (listing.status === 'available') {
      await RequestRecord.updateMany({ listingId: listing._id, status: 'pending' },
        { $set: { status: 'cancelled', cancellationReason: 'listing_hidden' } }, { session });
    }
    await ModerationAction.create([{ adminId, actionType: 'listing.hide', targetType: 'listing', targetId: listing._id,
      reason, metadata: { previousStatus: listing.status, nextStatus } }], { session });
  }); } finally { await session.endSession(); }
  return adminListingDetail(id);
}
