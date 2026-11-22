# UniCircle API endpoints

**Status:** Proposed backend contract for the React frontend in PR #1. The frontend currently uses browser storage. The available repository snapshot contains no Express server, so these routes have not been implemented or exercised over HTTP.

## Conventions

- **Base path:** `/api/v1`. Requests and responses use JSON except multipart photo uploads. For a session-cookie implementation, send credentials on frontend requests and enforce CSRF protection on mutations.
- **Access:** Guest routes are public. Session routes require sign-in. Member routes require a verified member or administrator. Admin routes require the administrator role. Check ownership and request participation on the server.
- **Responses:** Return `{ "data": ... }` for successful JSON responses and `{ "error": { "code": "...", "message": "...", "fields": {} } }` for errors. The optional `fields` maps input names to field messages. Use `200` for reads and updates, `201` for creations and `204` where listed.
- **Errors:** `400` malformed input, `401` missing or invalid session, `403` insufficient access, `404` missing or inaccessible item or request, `409` conflict with current state, `422` invalid fields, `429` rate limit.
- **Dates and amounts:** Use `YYYY-MM-DD` for pickup and return dates. Send pickup times as ISO 8601 with an explicit offset. Interpret campus dates in `Asia/Dhaka`. Use integer poisha for money and divide by 100 for display in BDT.

## Authentication and profile

| Method and path | Access | Input and success response |
| --- | --- | --- |
| `POST /auth/register` | Guest | `name`, `password`, and exactly one of `email` or `universityId`. Creates an account and session. Returns current user and verification status with `201`. |
| `POST /auth/login` | Guest | `identifier` (email or university ID), `password`. Sets the session cookie and returns the current user. |
| `POST /auth/logout` | Session | Ends the session and clears its cookie. Returns `204`. |
| `GET /auth/me` | Session | Returns `id`, `name`, `role`, and `verificationStatus`. |
| `POST /auth/verify-email` | Guest | One-time `token`. Returns the result of verification. The client then re-fetches its session, or signs in if needed. |
| `POST /auth/resend-verification` | Session | Issues a fresh verification link for the signed-in email-pending account. Returns `204`. |
| `PATCH /users/me` | Member | `name`. Returns the updated current user. |

Use role values `member`, `admin`. Use verification status values `email_pending`, `pending_review`, `verified`, `rejected`. Marketplace responses expose owner display names. University IDs are restricted to authorized verification operations.

## Listings and photos

| Method and path | Access | Input and success response |
| --- | --- | --- |
| `GET /listings` | Member | Optional `q`, `category`, `type`, `freeOnly`, `page`, `limit`. Returns `{ items, page, limit, total }` with newest available, visible listings first. |
| `GET /listings/:id` | Member | Returns a visible listing with `ownerName`, amount, condition and status. Unavailable listings are available to their owner through their history. |
| `GET /users/me/listings` | Member | Returns current user's listings and their statuses, including previous and hidden listings. |
| `POST /listings` | Member | `title`, `category`, `description`, `condition`, `type`, and applicable fields below. Returns created listing with `201`. |
| `PATCH /listings/:id` | Owner | Listing fields to update. Apply the type rules to the resulting listing. Returns updated listing. Accept only for visible, available listings. |
| `POST /listings/:id/close` | Owner | Closes a visible, available listing and cancels pending requests. Returns updated listing. |
| `POST /uploads/photos` | Member | Multipart `photo`. Accept JPG, PNG or WebP up to 1 MB. Returns `{ photoId, photoUrl }` with `201`. Only the uploader can attach their uploaded photo to a listing. |

| Listing type | Price or exchange fields |
| --- | --- |
| `sell` | Positive `amountPoisha` for the sale price. |
| `rent` | Positive `amountPoisha` per campus calendar day. |
| `donate`, `free_borrowing` | Store `amountPoisha: 0`. Reject nonzero amounts. Both types match `freeOnly=true`. |
| `exchange` | Require `exchangeTerms`. Keep the amount empty or `null`. |

An optional `photoId` attaches a photo. For updates, explicit `photoId: null` removes it and an omitted field retains it. Return `photoUrl` for display. Category and condition values match the visible labels in `market.js`. Listing statuses are `available`, `reserved`, `checked_out`, `completed`, `closed`. Track moderation visibility separately. A change to price, type, or exchange terms cancels existing pending requests with a reason.

## Requests, pickup and returns

| Method and path | Access | Input and success response |
| --- | --- | --- |
| `POST /listings/:id/requests` | Member | Rent and Free Borrowing require `pickupDate` and `returnDate`. Exchange requires `offer`. Sell and Donate need no additional fields. Returns a pending request with `201`. |
| `GET /requests?direction=sent` | Member | Returns requests made by the signed-in user. Use `direction=received` for incoming requests on their listings. |
| `GET /requests/:id` | Participant | Returns request details, saved terms and permitted actions. |
| `POST /requests/:id/accept` | Owner | `pickupPoint`, `pickupAt`. Accepts one pending request, reserves the listing and declines competing requests. Returns the updated request. |
| `POST /requests/:id/decline` | Owner | Declines a pending request. Returns the updated request. |
| `POST /requests/:id/cancel` | Requester or participant | Requester may cancel pending. Either participant may cancel accepted before handover. Reopens a visible listing if it was reserved. |
| `POST /requests/:id/handover` | Owner | Moves Rent and Free Borrowing to `checked_out`. Completes Sell, Donate, and Exchange after handover. |
| `POST /requests/:id/return` | Owner | Completes a checked-out request. Reopens a visible listing. A hidden listing remains off the feed. |

Return at least `id`, `listingId`, `requesterId`, `type`, `status`, saved amount or exchange terms, applicable dates and fee, and `allowedActions`. Restrict pickup details to participants. Request statuses are `pending`, `accepted`, `declined`, `cancelled`, `checked_out`, `completed`.

The server calculates fee as the number of calendar days from pickup to return times the daily rate. Return must follow pickup. For a temporary loan, the accepted pickup time must fall on the requested campus pickup date. Prevent requests on one's own listing and repeat active requests. Accept and reserve in one transaction, and respond with `409` for stale or competing actions.

### Example rental flow

1. `POST /listings/item-0/requests` with `{"pickupDate":"2026-12-01","returnDate":"2026-12-04"}`. A daily rate of 100 BDT yields `feePoisha: 30000`.
2. The owner sends `POST /requests/:id/accept` with `{"pickupPoint":"Library entrance","pickupAt":"2026-12-01T14:00:00+06:00"}`.
3. The owner calls `POST /requests/:id/handover` at pickup and `POST /requests/:id/return` when the item comes back.

## Administration

| Method and path | Access | Input and success response |
| --- | --- | --- |
| `GET /admin/verifications?status=pending` | Admin | Returns manual review records, including the submitted university ID. |
| `POST /admin/verifications/:id/decision` | Admin | `decision` of `approve` or `reject`, with an optional `reason`. Returns decision and updates the user verification status. |
| `GET /admin/listings` | Admin | Returns moderation listing records with owner, status and visibility. |
| `POST /admin/listings/:id/hide` | Admin | Requires a `reason`. Removes the listing from the feed and cancels pending requests, including an accepted request if still reserved. A checked-out request can still complete return. Returns updated listing. |
| `GET /admin/audit` | Admin | Returns timestamped review and moderation actions, including administrator and reason if supplied. |

Before implementation, confirm campus email domains, official pickup points, the session and CSRF policy, enum names, and response schemas with the backend team.
