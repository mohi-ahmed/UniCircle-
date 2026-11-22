# UniCircle Frontend

UniCircle is a campus marketplace for verified university members. It supports selling, renting, exchanging, donating, and lending items for free. This React and Vite frontend implements the SRS v1.1 flows with demo accounts and browser storage. Live Express and PostgreSQL integration is pending.

Frontend development and UI design by **Toufiqul Islam** (Team Carbon).

## Run locally

Use Node.js 20.19+ or 22.12+. From the repository root, run:

```bash
cd frontend
npm ci
npm run dev
```

Open the **Local** URL printed by Vite. It is usually `http://localhost:5173`. Run `npm run build` for the production bundle, `npm run preview` to preview that bundle and `npm test` for the marketplace logic tests.

## Demo walkthrough

1. On **Sign in**, choose **Try demo account**. To test the form manually, use `demo@seu.edu.bd` and the demo password shown on the page. The header displays **Profile** after sign-in. Use **Profile** to change your display name or sign out. Visitors see sign-in or registration, and unverified accounts see verification status.
2. In **Marketplace**, search by title and try the category and listing-type filters. **Free items only** includes Donate and Free Borrowing. **Clear filters** resets the search and filters.
3. In **Post Item**, select a price option, enter the item details and optionally upload a photo. Posted items appear in **My Activity → My Listings**, where you can edit or close available listings you own.
4. Open Nadia’s **Scientific Calculator** listing and send a request with pickup and return dates. Switch to **Nadia** in the demo account bar, then open **My Activity → Requests Received**. Accept the request with a campus pickup point and time on the proposed date, record handover and confirm return.
5. Switch to **Campus admin** and open **Admin** to review a sample manual verification or hide a listing with a reason. Check **Audit history** for the recorded action. If you test registration, use fictional details. Email verification is simulated.

| Post Item option | What the form asks for |
| --- | --- |
| Paid → Sell | A positive sale price in BDT |
| Paid → Rent | A positive daily rate in BDT |
| Free (Donate) | No amount. The listing is saved at zero. |
| Exchange | What the owner would accept in return |
| Free Borrowing | No amount. The listing is saved at zero. |

The demo photo picker supports JPG, PNG and WebP up to 1 MB. You can clear a selected photo and submit without it. Demo data persists in the current browser. To reset the demo, clear site data for its local origin.

## Source map

| File | Responsibility |
| --- | --- |
| [src/main.jsx](src/main.jsx) | Navigation, access-based screen selection, Marketplace and shared state |
| [src/marketplace-ui.jsx](src/marketplace-ui.jsx) | Collage animation, category navigation and Pointfex footer |
| [src/screens.jsx](src/screens.jsx) | Account, post and edit form, item details, My Activity and Admin |
| [src/demo-store.js](src/demo-store.js) | Demo session, registration, profile and browser persistence |
| [src/market.js](src/market.js) | Listing types, filters, rental fees and request state transitions |
| [src/market.test.js](src/market.test.js) | Automated marketplace logic tests |

## Backend integration handoff

See [UniCircle API endpoints](API.md) for the proposed Express routes, payloads and response formats. The table below summarizes what the UI needs. Align the integration with SRS v1.1.

| Area | Frontend sends | Backend provides or enforces |
| --- | --- | --- |
| Auth and profile | Sign-in identifier and password, registration details, verification token or resend, sign-out and display-name edits | Session state, current user role and verification status, and registration field errors. Only verified accounts can access marketplace routes. Restrict private account data to authorized views. |
| Listings and uploads | Title, category, description, condition, listing type, price or swap terms and optional image | Visible, available listings newest first, search and filter results, owner display name, authoritative status and validated photo URL. Only the owner can edit or close an available listing. |
| Requests and handover | Item ID, proposed dates for temporary loans, offer for swaps, and pickup point and time for acceptance | Per-user history, saved terms and fees, allowed actions and authoritative statuses. Only the participants receive pickup details. Use campus calendar dates for rent and agree how to encode Asia/Dhaka pickup times. |
| Admin | Review decision or listing ID and moderation reason | Admin-scoped verification queue and a timestamped audit record with the actor and reason. A hidden listing disappears from the feed. |

- **Listing types.** Agree how API enums map to `Sell`, `Rent`, `Exchange`, `Donate` and `Free Borrowing` in the UI. `Paid` is a form option. Send the actual listing type. Validate a positive BDT amount for Sell and Rent, zero for Donate and Free Borrowing, and swap terms with no money amount for Exchange.
- **Request consistency.** In one database transaction, accepting a pending request reserves the item and declines competing pending requests. If two accept operations race, return a conflict to the losing request. A hidden listing that is already checked out must still allow its return and stay off the feed afterward.
- **React wiring.** Start with the calls into `demo-store.js` from `main.jsx` and `screens.jsx`. Replace the synchronous demo calls with an async API client. Await each mutation before reporting success or navigating. Handle loading, field errors, expired sessions and conflicts, then refresh affected data. Remove the demo account switcher from the API-backed build.
- **Team inputs.** Confirm the campus email domain, verification delivery and resend policy, pickup points, image size limit, and the JSON error format.

## Verification status

The production build and four marketplace logic tests passed on the frontend revision this guide describes. Route and form checks covered guest access, signed-in navigation, admin visibility and the five listing types. End-to-end browser QA and testing against the live API are pending.
