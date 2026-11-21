# UniCircle frontend

Frontend development and UI design by **Toufiqul Islam** (Team Carbon).

React, Vite, and plain CSS for UniCircle's SRS v1.1. The browser demo uses synthetic accounts and browser storage.

## Run locally

From the repository root, run:

    cd frontend
    npm ci
    npm run dev

Use Node.js 20.19+ or 22.12+. Run `npm run build` for the production bundle and `npm test` for the marketplace logic tests.

## Walk through the demo

1. Select **Try demo account** on the sign-in page. Visitors and pending applicants see sign-in or verification screens.
2. Try **Free items only**. Both Donate and Free Borrowing appear with distinct labels. Try a category and a search, then clear the filters.
3. Open **Post Item**. **Paid** opens Sell or Rent and its amount. **Free (Donate)** and **Free Borrowing** save zero, while **Exchange** asks for swap terms. A selected photo can be removed and the form submitted without it.
4. Open Nadia's calculator and request it with pickup and return dates. Switch to Nadia using the demo account bar. In **My Activity → Requests Received**, accept with a pickup point and time, record handover, then confirm return.
5. Switch to **Campus admin** to review a manual application or hide a listing with a reason. Use fictional details for demo registration.

## Express integration handoff

Agree on the endpoint URLs and response format with the backend team before wiring the API. The UI currently reads browser state synchronously. Start from `src/demo-store.js` and the calls in `src/main.jsx` and `src/screens.jsx`. When adopting HTTP, await mutations before navigating or reporting success, show pending and error states, and refresh the affected data. Remove the demo-account switcher from the API-backed build.

| Area | What the frontend sends | What the backend needs to provide |
| --- | --- | --- |
| Auth and profile | Sign-in identifier and password, registration details, sign-out, verification token or resend, display-name edits | Current account status and role, session expiry, and field errors for registration. Keep hashes, tokens, university IDs and emails out of marketplace responses. |
| Listings | Title, category, description, condition, listing type, BDT amount, exchange terms and optional photo | Available and visible listings newest first, search/category/type/free filtering, owner display info, and authoritative status. Validate Sell/Rent amount, zero for Donate/Free Borrowing, and swap terms without a money amount for Exchange. |
| Requests | Item ID, pickup and return dates for temporary loans, offered item for swaps, action and pickup details when accepting | Per-user request history with snapshotted terms and fees. Use campus calendar dates for rental fees and agree how timestamp values represent Asia/Dhaka. Only participants receive pickup details. |
| Admin and uploads | Review decision, listing ID and moderation reason, optional listing image | Admin-scoped review queue and audit records, validated upload with a URL, and server-side role and ownership checks. |

Map the API's enum values to the labels in `src/market.js` or agree on shared values. Use the listing type itself for data exchange, since Paid is a form option. Return clear errors for expired sign-in, forbidden operations, invalid fields and conflicting requests. Accepting a request must reserve the item and resolve competing pending requests in one database transaction. Hiding a checked-out listing must still allow its return and keep it closed afterward.

Confirm the real campus email domain, verification delivery, pickup points and production photo limit with the backend team. The current photo picker accepts JPG, PNG and WebP up to 1 MB for the demo.
