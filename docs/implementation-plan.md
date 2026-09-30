# Motor Parking System — Implementation Plan

## 1. Project Objective

Build a small, mobile-first motorcycle parking management PWA for a single parking operator.

The system replaces handwritten parking records with a fast digital workflow:

```text
Open App
  ↓
Park Motorcycle
  ↓
Motorcycle remains PARKED
  ↓
Customer returns
  ↓
Checkout / collect payment
  ↓
Transaction becomes COMPLETED
```

The application is hosted publicly through Cloudflare Pages but stores operational data locally on the user's device using IndexedDB.

This is intentionally a **local-first single-device system**, not a multi-user SaaS.

---

# 2. Locked Technology Stack

## Frontend

* React
* TypeScript
* Vite
* Tailwind CSS
* React Router

## Local persistence

* Dexie
* IndexedDB

## PWA

* `vite-plugin-pwa`
* Service worker
* Offline-capable application shell

## Testing

* Vitest
* React Testing Library where useful

## Hosting

* Cloudflare Pages
* GitHub repository
* Automatic deployment from `main`

Cloudflare's current React/Vite Pages configuration uses:

```text
Build command: npm run build
Build output: dist
Production branch: main
```

Cloudflare Pages supports GitHub-connected automatic deployments and preview deployments.

---

# 3. Architecture

```text
                    Cloudflare Pages
                          │
                    React + Vite PWA
                          │
                    Application Logic
                          │
                 Parking Repository
                          │
                       Dexie
                          │
                     IndexedDB
                          │
                    User's Device
```

Cloudflare Pages only hosts and serves the application.

Parking records are NOT stored on Cloudflare.

There is:

* No API
* No Cloudflare Worker
* No D1
* No authentication
* No server-side database

---

# 4. Architectural Boundary

All persistent parking operations must go through a small repository/data-access layer.

Example:

```ts
parkingRepository.create()
parkingRepository.getActive()
parkingRepository.getById()
parkingRepository.checkout()
parkingRepository.getHistory()
parkingRepository.getDailyStats()
```

UI components must not directly manipulate Dexie tables.

The repository boundary exists so a future cloud-backed implementation could replace IndexedDB without rewriting the application.

Do NOT create an elaborate repository/service/domain architecture.

One simple data-access boundary is sufficient.

---

# 5. Core Data Model

```ts
type ParkingStatus = "parked" | "completed";

type PaymentStatus = "unpaid" | "paid";

interface ParkingTransaction {
  id: string;

  plateNumber: string;

  customerName?: string;

  checkInAt: number;
  checkOutAt?: number;

  fee: number;

  status: ParkingStatus;

  paymentStatus: PaymentStatus;
  paidAt?: number;
}
```

## Required field

```text
plateNumber
```

## Optional field

```text
customerName
```

Do NOT add motorcycle color, motorcycle model, customer phone number, address, or other fields unless a concrete operational requirement appears.

Minimize operator input.

---

# 6. Database

Create a Dexie database containing:

```text
transactions
settings
```

Settings should contain the small amount of configurable application data.

Example:

```ts
interface AppSettings {
  id: "main";
  businessName: string;
  parkingFee: number;
}
```

Default values:

```text
businessName: "Motor Parking"
parkingFee: 20
```

Use a schema version from the beginning so future migrations are possible.

---

# 7. Transaction Lifecycle

## Check-in

Create:

```text
status = "parked"
paymentStatus = "unpaid"
checkInAt = current timestamp
```

The configured parking fee must be copied into the transaction.

Do NOT calculate historical fees from current settings.

Example:

```text
Parking fee today: ₱20

Transaction:
fee = 20
```

If the owner later changes the setting:

```text
Parking fee: ₱25
```

the previous transaction remains:

```text
fee = 20
```

---

# 8. Plate Normalization

Before storing a plate:

1. Trim whitespace.
2. Convert to uppercase.
3. Collapse unnecessary internal whitespace where appropriate.

Example:

```text
" abc 1234 "
        ↓
"ABC 1234"
```

The normalized value is used for duplicate-active-parking checks.

---

# 9. Active Parking Rule

A motorcycle cannot have more than one active parking record.

Before creating a new parking transaction:

```text
Search active transactions
where status === "parked"
and plateNumber === normalizedPlate
```

If found:

```text
Reject check-in.
```

Display a useful message:

```text
This motorcycle is already parked.
```

Do not silently create duplicate records.

---

# 10. Checkout

Normal checkout flow:

```text
Active Parking
      ↓
Checkout
      ↓
Show transaction details
      ↓
Mark Paid & Check Out
      ↓
Completed
```

On paid checkout:

```ts
status = "completed"
paymentStatus = "paid"
checkOutAt = now
paidAt = now
```

The transaction disappears from the active parking list.

---

# 11. Unpaid Checkout

Support a secondary action:

```text
Check Out Without Payment
```

This creates:

```ts
status = "completed"
paymentStatus = "unpaid"
checkOutAt = now
```

`paidAt` remains undefined.

This is required because the system must record what actually happened rather than falsely assuming every checkout was paid.

Unpaid completed transactions remain visible in History.

They do NOT count toward revenue.

---

# 12. Revenue Rule

Revenue means:

> Money actually marked as paid.

Daily revenue must only include transactions where:

```text
paymentStatus === "paid"
```

and:

```text
paidAt
```

falls within the requested day.

Do NOT calculate revenue from:

```text
status === "completed"
```

alone.

---

# 13. Dashboard

Dashboard displays:

```text
Currently Parked
Today's Entries
Completed Today
Collected Today
```

Definitions:

### Currently Parked

Count:

```text
status === "parked"
```

### Today's Entries

Count transactions whose `checkInAt` falls within today.

### Completed Today

Count transactions whose `checkOutAt` falls within today.

### Collected Today

Sum `fee` for transactions whose:

```text
paymentStatus === "paid"
```

and whose `paidAt` falls within today.

### Operations Header Collected (Lot-State Gauge)

The Operations screen shows `collectedToday + collectedHeld`, where
`collectedHeld` sums `fee` for currently-parked paid transactions whose
revenue day (`firstPaidAt ?? paidAt`) is before today. Overnight holds
stay visible across midnight; checked-out bikes leave the gauge.
Daily revenue reporting (Analytics, History, downloaded reports) always
uses the Collected Today rule above and is unaffected.

Use local device time consistently.

---

# 14. Screen Structure

Use four primary sections.

```text
Home
Parking
History
Settings
```

Mobile navigation should be simple and immediately understandable.

---

# 15. Home / Dashboard

Purpose:

> Give the operator an immediate operational overview.

Display:

```text
MOTOR PARKING

Currently Parked
12

Today's Entries
37

Completed Today
25

Collected Today
₱500
```

Primary action:

```text
+ Park Motorcycle
```

Also show a compact list of currently parked motorcycles.

Do not build charts or advanced analytics.

---

# 16. Parking Screen

Primary workflow:

```text
Park Motorcycle
```

Form:

```text
Plate Number *
[ ABC 1234 ]

Customer Name
[ Optional ]

[ Park Motorcycle ]
```

After creation, show confirmation and/or active parking state.

Active parking list:

```text
ABC 1234
Parked 2h 14m
₱20

[ Check Out ]
```

Provide plate search.

The operator should be able to locate a motorcycle quickly.

---

# 17. Checkout UI

Display:

```text
ABC 1234

Checked in
2:34 PM

Duration
2h 14m

Parking fee
₱20
```

Primary action:

```text
Mark Paid & Check Out
```

Secondary action:

```text
Check Out Without Payment
```

Before destructive or irreversible actions, use a simple confirmation where appropriate.

---

# 18. History Screen

Display completed transactions.

Example:

```text
TODAY

ABC 1234
2:34 PM → 5:12 PM
₱20 · Paid

XYZ 5678
1:20 PM → 4:03 PM
₱20 · Paid

DEF 9012
11:02 AM → 3:15 PM
₱20 · Unpaid
```

Required functionality:

* Search by plate
* View completed transactions
* Paid/unpaid indication

Simple filters may include:

```text
All
Paid
Unpaid
```

Do not implement complex reporting.

---

# 19. Settings

Settings should contain only:

```text
Business Name
Parking Fee

Data
  Export Backup
  Import Backup

Clear All Data
```

No accounts.

No permissions.

No employee management.

No cloud synchronization.

---

# 20. Backup System

Because IndexedDB is device-local, backup is an important MVP feature.

Implement JSON export.

Example filename:

```text
motor-parking-backup-YYYY-MM-DD.json
```

Backup structure:

```json
{
  "version": 1,
  "exportedAt": 0,
  "settings": {
    "businessName": "Motor Parking",
    "parkingFee": 20
  },
  "transactions": []
}
```

Import requirements:

* Validate file structure.
* Validate version.
* Reject malformed data.
* Do not partially import invalid data.
* Clearly confirm before replacing/merging data.
* Preserve transaction IDs.
* Prevent accidental duplicate imports.

Preferred MVP behavior:

```text
Import backup
    ↓
Validate completely
    ↓
Confirm replacement
    ↓
Replace local dataset
```

Do not implement complex backup synchronization.

---

# 21. Clear All Data

This is destructive.

Require explicit confirmation.

Example:

```text
Delete all local parking data?

This cannot be undone unless you have a backup.

[ Cancel ]
[ Delete Everything ]
```

Never execute this action from a single accidental tap.

---

# 22. PWA Requirements

The application must:

* Be installable on supported mobile browsers.
* Cache the application shell.
* Load while offline after initial installation.
* Continue reading/writing IndexedDB offline.
* Display an appropriate offline state only when useful.
* Never require an API request for core parking operations.

Core functionality must work without internet:

```text
Check-in
View active parking
Checkout
History
Dashboard
Settings
Export
Import
```

---

# 23. Routing

Use React Router only where it materially improves navigation.

Suggested routes:

```text
/
 /parking
 /history
 /settings
```

If the project can remain simpler without route complexity, a lightweight view/navigation approach is acceptable.

Do not introduce routing abstractions merely for architectural purity.

Cloudflare Pages treats React applications as SPAs by default, so direct SPA navigation should be tested in the deployed environment.

---

# 24. Suggested Folder Structure

```text
src/
├── app/
│   ├── App.tsx
│   └── routes.tsx
│
├── components/
│   ├── layout/
│   ├── ui/
│   └── parking/
│
├── db/
│   ├── database.ts
│   └── parkingRepository.ts
│
├── features/
│   ├── dashboard/
│   ├── parking/
│   ├── history/
│   └── settings/
│
├── lib/
│   ├── currency.ts
│   ├── dates.ts
│   └── validation.ts
│
├── types/
│   └── parking.ts
│
├── main.tsx
└── index.css
```

Keep files small and responsibility-focused.

Do not create unnecessary architectural layers.

---

# 25. Business Logic Location

Business rules must not be buried inside UI components.

Examples:

```text
plate normalization
duplicate active parking detection
checkout state transitions
daily statistics
revenue calculation
backup validation
```

Place reusable logic in appropriate feature/repository/lib modules.

Components should primarily handle:

```text
rendering
user input
loading/error states
calling application functions
```

---

# 26. Date and Time Handling

Use Unix timestamps internally:

```ts
number
```

Use local device time for:

* Today's dashboard
* Displayed check-in time
* Displayed checkout time
* Daily revenue
* Daily transaction counts

Create centralized date helpers instead of duplicating date arithmetic throughout components.

Be careful around midnight boundaries.

---

# 27. Currency

Use Philippine Peso.

Display:

```text
₱20
₱500
₱1,250
```

Do not introduce a full international currency abstraction.

The system currently has one currency:

```text
PHP
```

---

# 28. UI Principles

The application is an operational tool, not a marketing website.

Prioritize:

1. Speed
2. Readability
3. Large touch targets
4. Clear status
5. Minimal typing
6. Obvious primary actions
7. Fast scanning

Avoid:

* excessive cards
* decorative gradients
* unnecessary animations
* complex dashboards
* excessive modal usage
* tiny text
* desktop-first layouts
* generic AI-generated SaaS styling

The operator should be able to perform common actions with minimal taps.

---

# 29. Responsive Design

Mobile is the primary target.

Required:

```text
320px+
```

Also support:

```text
tablet
desktop
```

Desktop should not require a separate architecture.

Use the same application with responsive layout changes.

---

# 30. Error Handling

Handle at minimum:

* Database initialization failure
* Failed database operation
* Invalid plate
* Duplicate active plate
* Invalid backup
* Unsupported backup version
* Import failure
* Empty history
* Empty active parking
* No search results

Never silently swallow errors.

User-facing messages should describe the action that failed without exposing implementation details.

---

# 31. Loading States

Avoid unnecessary loading spinners for instantaneous local operations.

Use loading states where IndexedDB operations or page initialization may visibly take time.

Do not make the UI feel like a network application.

---

# 32. Testing Requirements

Write tests for business-critical behavior.

## Parking

* Create parking transaction.
* Require plate number.
* Normalize plate.
* Reject duplicate active plate.
* Snapshot current fee.
* Create unpaid active transaction.

## Checkout

* Paid checkout sets `status = completed`.
* Paid checkout sets `paymentStatus = paid`.
* Paid checkout sets `paidAt`.
* Checkout sets `checkOutAt`.
* Unpaid checkout remains unpaid.
* Unpaid transaction does not contribute to revenue.

## Dashboard

* Correct active count.
* Correct today's entries.
* Correct completed count.
* Correct daily revenue.
* Unpaid transactions excluded from revenue.
* Previous-day transactions excluded from today's metrics.

## Backup

* Export valid backup.
* Import valid backup.
* Reject malformed backup.
* Reject unsupported version.
* Do not modify data when validation fails.

---

# 33. Security / Data Considerations

There is no authentication in MVP.

Therefore:

> Anyone who can access the installed browser/device can potentially access the locally stored parking data.

This is acceptable for the intended single-operator MVP.

Do not falsely describe IndexedDB as secure storage.

Do not store passwords, payment credentials, API keys, or sensitive financial credentials.

---

# 34. Performance Requirements

The application should remain responsive with at least several thousand local transaction records.

Use IndexedDB queries rather than loading the entire dataset unnecessarily.

Do not prematurely optimize.

Do not introduce:

* Redux
* Zustand
* React Query
* server state libraries
* complex caching systems

There is no remote server state.

---

# 35. Explicitly Out of Scope

Do NOT implement:

* Authentication
* User accounts
* Cloud database
* Cloud synchronization
* Multi-device synchronization
* Multi-user access
* Employee accounts
* Multiple branches
* Parking slot assignment
* QR scanning
* Online payments
* GCash API
* SMS
* Push notifications
* Customer portal
* Automated billing
* Complex hourly pricing
* Advanced analytics
* AI
* Subscription system
* Payment gateway
* Admin dashboard
* Cloudflare Workers
* Cloudflare D1

These may be future capabilities, but they are not part of this implementation.

---

# 36. Implementation Phases

## Phase 0 — Project Setup

Create:

* React + TypeScript + Vite
* Tailwind CSS
* React Router if needed
* Dexie
* vite-plugin-pwa
* Vitest
* basic project structure

Acceptance:

```text
npm run dev works
npm run build works
npm run test works
```

---

## Phase 1 — Database

Implement:

* Dexie database
* Schema
* Settings
* Transaction model
* Repository functions

Acceptance:

* Database initializes correctly.
* Transactions can be created/read/updated.
* Repository has no UI dependencies.

---

## Phase 2 — Parking Workflow

Implement:

* Check-in form
* Plate normalization
* Duplicate active check
* Active parking list
* Plate search
* Checkout

Acceptance:

```text
Park → Active → Checkout → Completed
```

works entirely offline.

---

## Phase 3 — Payment

Implement:

* Paid checkout
* Unpaid checkout
* `paidAt`
* Revenue logic

Acceptance:

Paid and unpaid transactions behave differently and revenue only includes paid transactions.

---

## Phase 4 — Dashboard

Implement:

* Currently parked
* Today's entries
* Completed today
* Collected today
* Current active parking list

Acceptance:

Dashboard values match transaction data.

---

## Phase 5 — History

Implement:

* Transaction history
* Plate search
* Paid/unpaid filters
* Empty states

Acceptance:

Completed transactions are discoverable and accurately displayed.

---

## Phase 6 — Settings + Backup

Implement:

* Business name
* Parking fee
* Export
* Import
* Clear data

Acceptance:

A complete dataset can be exported, cleared, and restored from backup.

---

## Phase 7 — PWA

Implement:

* Manifest
* Icons
* Service worker
* Offline application shell
* Installability

Acceptance:

Installed PWA can perform core operations without an internet connection.

---

## Phase 8 — Production Hardening

Test:

* Mobile Chrome
* Desktop Chrome
* Offline mode
* Refresh while offline
* Browser restart
* PWA restart
* Midnight/day boundary
* Empty database
* Large transaction history
* Invalid backup
* Duplicate plate
* Repeated checkout
* Clear-data confirmation

Fix functional issues before visual polish.

---

## Phase 9 — Cloudflare Deployment

Connect the GitHub repository to Cloudflare Pages.

Production:

```text
main
  ↓
Cloudflare Pages
  ↓
npm run build
  ↓
dist
  ↓
*.pages.dev
```

Cloudflare's Git integration automatically deploys connected repository changes and provides preview deployments for branches/PRs.

Verify:

* Production deployment succeeds.
* PWA loads from `pages.dev`.
* SPA routes work on direct navigation.
* Assets load correctly.
* Service worker works on production HTTPS.
* IndexedDB persists after refresh.
* Core workflow works offline after initial load.
* Preview deployment works.

---

# 37. Acceptance Criteria

The project is considered MVP-complete when an operator can:

1. Open the application on a phone.
2. Install it as a PWA.
3. Create a motorcycle parking record.
4. See it immediately in active parking.
5. Search for the motorcycle.
6. Check it out.
7. Mark it paid.
8. See it in history.
9. See the payment reflected in today's revenue.
10. Close/reopen the application without losing data.
11. Use the core workflow without internet.
12. Export a backup.
13. Import the backup successfully.
14. Change the parking fee without modifying historical transaction fees.
15. Deploy the project through GitHub → Cloudflare Pages.

---

# 38. Agent Rules

Before modifying code:

1. Inspect the existing repository.
2. Read existing `AGENTS.md`, documentation, and configuration.
3. Reuse existing functionality.
4. Do not invent files or architecture without inspecting the project.
5. Do not duplicate existing utilities/components.
6. Keep implementation proportional to the project.
7. Prefer simple code over abstractions.
8. Do not add dependencies without a concrete reason.
9. Do not implement out-of-scope functionality.
10. Run relevant tests after changes.
11. Run the production build before declaring a phase complete.
12. Fix actual errors instead of hiding them.

The repository is the source of truth.

---

# 39. Definition of Done

A phase is not complete merely because the UI exists.

A phase is complete when:

```text
Implementation
    +
Business logic
    +
Persistence
    +
Validation
    +
Tests
    +
Production build
```

are working together.

Do not move to the next phase while a core acceptance criterion from the current phase is broken.

---

# 40. Final Architecture Decision

LOCKED FOR MVP:

```text
React
TypeScript
Vite
Tailwind
Dexie
IndexedDB
PWA
Vitest
GitHub
Cloudflare Pages
```

Data:

```text
LOCAL DEVICE ONLY
```

Deployment:

```text
GitHub
   ↓
Cloudflare Pages
   ↓
*.pages.dev
```

Future cloud synchronization is intentionally deferred.

The system should be designed so that adding a remote repository later is possible, but **the MVP must not contain cloud synchronization infrastructure**.

The goal is a small, reliable parking tool that can actually be deployed and used, not an unnecessarily complex SaaS platform.
