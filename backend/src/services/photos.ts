import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { createClient } from '@supabase/supabase-js';
import { getEnvironment } from '../config/env.js';
import { ApiError } from '../lib/http.js';
import { PhotoAsset } from '../models/core.js';

type PhotoType = 'image/jpeg' | 'image/png' | 'image/webp';

function storage() {
  const env = getEnvironment();
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) throw new ApiError(502, 'UPLOAD_FAILED', 'Photo storage is unavailable.');
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

function extension(contentType: PhotoType): string {
  return contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp';
}

export function matchesMagic(contentType: PhotoType, bytes: Uint8Array): boolean {
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  return new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF' && new TextDecoder().decode(bytes.slice(8, 12)) === 'WEBP';
}

function objectUrl(path: string): string {
  const env = getEnvironment();
  return `${env.SUPABASE_URL}/storage/v1/object/${encodeURIComponent(env.SUPABASE_LISTING_BUCKET)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}

function storageHeaders(): HeadersInit {
  const key = getEnvironment().SUPABASE_SERVICE_ROLE_KEY ?? '';
  return { apikey: key, authorization: `Bearer ${key}` };
}

export async function signPhoto(ownerId: mongoose.Types.ObjectId, input: { contentType: PhotoType; sizeBytes: number }) {
  const recent = await PhotoAsset.countDocuments({ ownerId, issuedAt: { $gt: new Date(Date.now() - 60 * 60_000) } });
  if (recent >= 30) throw new ApiError(429, 'RATE_LIMITED', 'Too many photo upload requests.', {}, 3600);
  const env = getEnvironment();
  const path = `${ownerId.toString()}/${randomUUID()}.${extension(input.contentType)}`;
  const issuedAt = new Date();
  const expiresAt = new Date(issuedAt.getTime() + 2 * 60 * 60_000);
  const { data, error } = await storage().storage.from(env.SUPABASE_LISTING_BUCKET).createSignedUploadUrl(path);
  if (error || !data?.token) throw new ApiError(502, 'UPLOAD_FAILED', 'Unable to prepare photo upload.');
  const asset = await PhotoAsset.create({ ownerId, storageKey: path, expectedSizeBytes: input.sizeBytes,
    expectedContentType: input.contentType, status: 'issued', secureUrl: null, issuedAt, expiresAt, attachedListingId: null });
  return { photoAssetId: asset._id.toString(), bucket: env.SUPABASE_LISTING_BUCKET, path, token: data.token, expiresAt: expiresAt.toISOString() };
}

export async function confirmPhoto(ownerId: mongoose.Types.ObjectId, photoAssetId: string) {
  const asset = await PhotoAsset.findOne({ _id: photoAssetId, ownerId });
  if (!asset) throw new ApiError(404, 'NOT_FOUND', 'Photo asset was not found.');
  if (asset.status === 'verified') return { photoAssetId: asset._id.toString(), secureUrl: asset.secureUrl as string };
  if (asset.status !== 'issued' || asset.expiresAt <= new Date()) throw new ApiError(409, 'STATE_CONFLICT', 'Photo upload is no longer confirmable.');
  const url = objectUrl(asset.storageKey);
  const head = await fetch(url, { method: 'HEAD', headers: storageHeaders() });
  const actualSize = Number(head.headers.get('content-length'));
  const actualType = head.headers.get('content-type')?.split(';')[0]?.trim();
  const range = await fetch(url, { headers: { ...storageHeaders(), range: 'bytes=0-15' } });
  let bytes = new Uint8Array();
  if (range.ok && range.body) {
    const reader = range.body.getReader();
    const first = await reader.read();
    await reader.cancel();
    bytes = first.value?.slice(0, 16) ?? bytes;
  }
  const valid = head.ok && Number.isSafeInteger(actualSize) && actualSize === asset.expectedSizeBytes &&
    actualSize <= 5_242_880 && actualType === asset.expectedContentType && matchesMagic(asset.expectedContentType as PhotoType, bytes);
  if (!valid) {
    await storage().storage.from(getEnvironment().SUPABASE_LISTING_BUCKET).remove([asset.storageKey]);
    asset.status = 'rejected';
    await asset.save();
    throw new ApiError(400, 'VALIDATION_ERROR', 'Uploaded photo does not match the permitted file.', { fields: { photoAssetId: 'Invalid photo bytes, type, or size.' } });
  }
  const secureUrl = storage().storage.from(getEnvironment().SUPABASE_LISTING_BUCKET).getPublicUrl(asset.storageKey).data.publicUrl;
  asset.status = 'verified';
  asset.secureUrl = secureUrl;
  await asset.save();
  return { photoAssetId: asset._id.toString(), secureUrl };
}

export async function cleanupOrphanPhotos(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60_000);
  const assets = await PhotoAsset.find({ attachedListingId: null, status: { $in: ['issued', 'verified', 'rejected'] }, createdAt: { $lte: cutoff } })
    .select('_id storageKey').limit(500);
  if (!assets.length) return 0;
  const { error } = await storage().storage.from(getEnvironment().SUPABASE_LISTING_BUCKET).remove(assets.map(asset => asset.storageKey));
  if (error) throw new ApiError(502, 'UPLOAD_FAILED', 'Unable to clean orphan photos.');
  const result = await PhotoAsset.deleteMany({ _id: { $in: assets.map(asset => asset._id) }, attachedListingId: null });
  return result.deletedCount;
}
