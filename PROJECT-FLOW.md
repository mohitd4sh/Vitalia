# VITALIA Project Flow

This document shows how a visitor moves through the application and how frontend requests reach the API and database.

## High-level flow

```mermaid
flowchart TD
    Browser[Browser opens VITALIA] --> About[Public About page: / or /about]
    About --> Login[Sign in: /login]
    About --> Register[Create account: /register]
    About --> Legal[Privacy and Terms pages]

    Register --> Session[API returns user and session token]
    Login --> Session
    Session --> Role{Account role and profile}

    Role -->|Patient profile incomplete| Setup[Complete patient profile: /setup]
    Setup --> Patient[Patient workspace: /dashboard]
    Role -->|Patient profile complete| Patient
    Role -->|Administrator| Admin[Admin workspace: /admin]
    Role -->|Center Master| CenterMaster[Assigned-center workspace: /admin]
    Role -->|Staff| Staff[Staff workspace: /staff/bookings]
    Role -->|Custom role| Custom[First permitted workspace]
    Role -->|No custom permissions| NoAccess[/no-access]

    Patient --> Tests[Browse diagnostics: /tests]
    Tests --> Booking[Choose collection method, center and appointment]
    Booking --> BookingAPI[Create booking through /api/bookings]
    BookingAPI --> MyBookings[Review bookings and payment: /bookings]
    MyBookings --> Reports[Access shared reports: /reports]

    Admin --> AdminOps[Manage bookings, diagnostics, patients, reports, centers and operations]
    Admin --> Roles[Manage accounts, custom roles and permissions]
    CenterMaster --> CenterOps[Manage assigned center, its accounts and center-scoped roles]
    Staff --> StaffOps[Handle assigned bookings and permitted reports]
    Custom --> CustomOps[Use only modules/actions granted to the custom role]

    AdminOps --> API[Protected Express API]
    Roles --> API
    CenterOps --> API
    StaffOps --> API
    CustomOps --> API
    MyBookings --> API
    Reports --> API
    API --> Auth[Authenticate token and check role/permissions]
    Auth --> MongoDB[(MongoDB models and records)]
    MongoDB --> API
    API --> Browser
```

## Startup and session handling

1. `src/main.jsx` mounts the React application inside `BrowserRouter`.
2. `src/App.jsx` selects a page based on the URL and current session.
3. The public landing page is available at `/` and `/about`; it does not require a session.
4. Sign-in and registration submit to `/api/auth/login` and `/api/auth/register`. The frontend stores the returned token and user in browser `sessionStorage`.
5. On reload with a stored token, the app requests `/api/auth/me` to validate and refresh the current user. An expired/invalid session is cleared.
6. Patient accounts without a completed profile are directed to `/setup`; other accounts go to their role-specific workspace.

## Role workspaces

- **Patient:** overview, diagnostic catalogue, bookings, and reports.
- **Administrator:** overview and operational management, including diagnostic tests, bookings, centers, patients, reports, staff, inventory, finance, settings, accounts, and custom roles.
- **Center Master:** manages one assigned center's diagnostics, bookings, reports, settings, inventory, staff, accounts, and center-specific custom roles. API queries scope this role to its assigned center; it cannot grant global administrator access or manage another center. Center-scoped custom roles and staff accounts are also restricted to their assigned center in operational APIs.
- **Staff:** assigned booking workflows and, for authorized staff roles, report workflows.
- **Custom role:** only permitted modules and actions. The backend enforces these permissions in addition to the frontend route and navigation checks. Custom roles can be global or scoped to a single center.

The shared notification bell shows unread action success/error messages and relevant booking, payment, report, and account updates for the signed-in user. Destructive actions use themed confirmation dialogs.

## Booking and report journey

1. A patient or custom-role user with booking-create permission opens `/tests` and chooses a diagnostic test.
2. In the **Book Diagnostic** dialog, the user selects center visit or home collection. A diagnostic can be shared across centers or assigned to selected centers. Home collection is configured per diagnostic test; if enabled for the selected test, it is available at an eligible active center and requires a collection address.
3. The user selects an appointment time and submits the booking. The API validates the test, center, date, collection method, and permissions before saving the booking.
4. The user reviews the booking and payment status in `/bookings`. Payment confirmation is handled by authorized staff; the application does not automatically verify a transfer.
5. Authorized staff can attach a report to a completed booking. The patient can retrieve available reports from `/reports`.

## Frontend-to-database request path

```text
React page/component
  -> src/services/api.js (HTTP request, session token, response/error handling)
  -> backend/server.js (Express API mount)
  -> backend/middleware/auth.js (token authentication and permission checks)
  -> backend/routes/*.js (validation and business operations)
  -> backend/models/*.js (Mongoose models)
  -> MongoDB
```

The API requires `MONGODB_URI` and `JWT_SECRET` from `backend/.env` before it starts. The Vite development server proxies `/api` requests to `http://localhost:5000`.

## Useful entry points

| Concern | Main files |
| --- | --- |
| React entry and page routing | `src/main.jsx`, `src/App.jsx` |
| API client and browser session | `src/services/api.js` |
| Role permission helpers | `src/services/permissions.js` |
| Sign-in and registration | `src/components/auth/Login.jsx`, `src/components/auth/Register.jsx` |
| Patient profile setup | `src/components/onboarding/UserSetup.jsx`, `backend/routes/profile.js` |
| Diagnostic booking UI | `src/pages/SearchTests.jsx` |
| API startup and route mounts | `backend/server.js` |
| Authentication middleware | `backend/middleware/auth.js` |
| Admin operations and custom roles | `backend/routes/operations.js` |
| Booking endpoints | `backend/routes/bookings.js` |
| Report endpoints | `backend/routes/reports.js` |
| Database schemas | `backend/models/` |
