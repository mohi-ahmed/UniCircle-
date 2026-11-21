# UniCircle frontend

Frontend development and UI design by **Toufiqul Islam** (Team Carbon).

React, Vite, and plain CSS for UniCircle's SRS v1.1. The team repository has no backend or API contract yet, so this frontend uses an in-browser demo adapter and synthetic accounts.

## Run locally

Use Node.js 20.19+ or 22.12+ (a current LTS works).

    npm install
    npm run dev

From the repository root, run these commands inside `frontend/`. Use `npm run build` for the production bundle and `npm test` for the state tests.

## Walk through the demo

- Start at **Sign in**. The SEU demo email is prefilled. Use the sample password displayed on the page. In an existing demo session, open the account menu and sign out first.
- Browse as Toufiqul. Try **Free items** to see both Donate and Free Borrowing.
- Open Nadia's calculator, propose pickup and return dates, and send the request.
- Switch to Nadia in the demo account bar. In **My Activity → Requests Received**, accept with a campus pickup point and time, record handover, and confirm return.
- Switch to Campus admin to review a sample verification submission or hide a listing with a reason.
- Registration supports an email-link simulation or manual review. Use fictional data only. Demo accounts all use the shared sample password for sign-in. The demo stores listings and demo registration details in browser storage and does not collect personal passwords. Clear UniCircle site data to reset the demo.

## Express integration

`src/demo-store.js` is the demo data boundary. Connect these reads and actions to the team's Express API once its endpoints and response shapes are defined. Wire server sessions, verification, moderation, request permissions, consistency rules, and signed photo uploads through that API. Date and pickup point options in this demo are placeholders for the first campus. The demo intentionally uses a 1 MB limit for local photos.
