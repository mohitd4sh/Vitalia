# VITALIA Diagnostics

VITALIA is a diagnostics-center portal with patient booking and reports, admin operations, and role-based staff workflows. It uses React/Vite for the client and Express with MongoDB for the API.

## Requirements

- Node.js 20.19+ or 22.12+
- MongoDB (local or hosted)

## Run locally

1. Install the frontend dependencies from the project root:

   ```sh
   npm install
   ```

2. Copy `.env.example` to `.env` in the project root. Set `VITE_API_URL` if the API is not available at `http://localhost:5000`.

3. Install the backend dependencies and configure its environment:

   ```sh
   cd backend
   npm install
   ```

   Copy `backend/.env.example` to `backend/.env`. Set `MONGODB_URI` and a long, random `JWT_SECRET`. Keep real secrets out of source control.

4. Start the API in one terminal:

   ```sh
   cd backend
   npm run dev
   ```

5. Start the frontend from the project root in another terminal:

   ```sh
   npm run dev
   ```

The Vite development server proxies `/api` requests to `http://localhost:5000`. The API health check is available at `/api/health`.

The public About Vitalia page is the webapp's landing page at `/` and is also available at `/about`. Visitors can sign in or create an account from that page; signed-in users can open their role-specific workspace from its navigation.

See [PROJECT-FLOW.md](./PROJECT-FLOW.md) for the visitor, authentication, booking, role, and API-to-database flows.
For a visual, print-friendly Word version, see [PROJECT-FLOW.docx](./PROJECT-FLOW.docx).

## Admin and staff access

Register a normal account first. To grant the initial administrator access, update that account's role directly in MongoDB using the exact email used during registration:

```javascript
db.users.updateOne(
  { email: "admin@example.com" },
  { $set: { role: "admin" } }
)
```

Sign out and back in after changing the initial role. From **Admin → Centers**, administrators can create a center and its Center Master account together by entering the manager's name, email, and temporary password. The temporary password must be shared securely with the new manager. From **Admin → Roles**, administrators can also assign existing accounts as patients, staff, administrators, or Center Masters, assign a center, choose a staff permission, and deactivate or reactivate accounts. Center Masters are restricted to their assigned center: they can manage that center's bookings, diagnostics, reports, settings, inventory, staff, accounts, and center-specific custom roles, but cannot grant global administrator access or manage another center. Center-specific diagnostics, settings, and role definitions are isolated; existing shared diagnostics and settings remain available to administrators, and center settings are initialized from the shared defaults the first time a center opens them.

Administrators and Center Masters can create custom roles with read, create, update, and delete permissions for supported modules, edit their permission matrix, and remove roles after all assigned accounts are reassigned. Create, update, and delete permissions include read access because users need to load the module workspace before using those actions. Custom permissions are enforced by the API as well as the workspace navigation. Users should sign in again after a role change or permission update to refresh their workspace. Accounts are deactivated rather than permanently deleted so related booking and report history is preserved. Administrators cannot change their own access or deactivate the last active administrator.

The **Admin → Discounts** section lets administrators create global or center-specific coupon codes, while Center Masters can manage codes for their assigned center. Configure percentage or fixed INR discounts, optional minimum booking amounts, percentage caps, total usage limits, per-user usage limits, and validity dates. Patients apply an active coupon during booking; the API validates the discount and records the final price and coupon on the booking and bill. Inactive or expired coupons cannot be used.

Destructive actions use themed confirmation dialogs instead of browser-native prompts. The notification bell is available to every signed-in role; it keeps unread action success/error messages and relevant booking, payment, report, and account updates for up to 90 days.

From the admin workspace, create diagnostic tests and active centers before patients can make bookings. Diagnostics can be shared across all centers or assigned to selected centers; Center Masters manage diagnostics scoped only to their assigned center. Home collection availability is configured on each diagnostic test; it is not a center setting. Existing diagnostics default to center visits only until home collection is enabled for that test. If enabled, patients can choose home collection with an active center where the test is available and must provide a collection address. Staff accounts can be assigned receptionist, phlebotomist, or technician permissions. Receptionists and technicians can send patient PDFs; they can record physical report handover during upload.

## Payments and reports

Patients can choose UPI or cash for each booking. Set the center's UPI ID and review received/pending totals on **Admin → Finance & UPI**. Patients can preview and print a bill copy from each booking, and administrators can do the same from Finance. Bills show patient, center, diagnostic test, appointment, itemized price, payment state, and recorded reference details; patients can keep the booking reference when requesting a duplicate from the center. The patient portal provides a booking-specific UPI QR code and payment link. UPI and cash payments remain pending until an administrator or receptionist verifies receipt and confirms them in **Bookings** or **Finance & UPI**. The application does not automatically verify UPI transfers or issue refunds, so staff must confirm payment against the bank/UPI account before marking it received.

Open admin, staff, booking, and report pages refresh from the API every five seconds while the browser tab is visible. Returning to the tab also triggers an immediate refresh.

Patient reports are currently held temporarily in the API process's memory: each PDF is limited to 10 MB and the queue is bounded. Reports are attached to a completed booking; that booking shows a download reminder while the report is available. A report is removed after download or after seven days, and pending reports are lost if the API restarts. Use durable encrypted storage before deploying this workflow for production.

## Checks

```sh
npm run build
npm run lint
```

Run the backend with `npm run dev` or `npm start` from `backend`.
