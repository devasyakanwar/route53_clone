# Project Guide: Route 53 Console Clone

How this project was built, how it is organised, and why each decision was made. Each section can be read on
its own; the last section has short answers to questions you are likely to be asked.

---

## 1. The project in one paragraph

A full-stack clone of the Amazon Route 53 console. The frontend is **Next.js 16 (App Router, TypeScript strict)**
using **Cloudscape**, AWS's own open-source design system, so the UI looks and behaves like the real console. The
backend is **FastAPI** with **SQLAlchemy 2.0** on **SQLite**. It implements mocked login, hosted zones (CRUD), DNS
records (CRUD for A, AAAA, CNAME, TXT, MX, NS, PTR, SRV, CAA and more), health checks and a dashboard. Record changes
follow the real Route 53 API: they are sent as an **atomic change batch** (CREATE / UPSERT / DELETE), so either every
change applies or none does. Bonus features: BIND zone file import, JSON/BIND export, dark mode, keyboard shortcuts
and bulk operations. It is covered by 103 backend tests and 7 browser end-to-end tests.

---

## 2. Assignment requirement → where it lives

| Requirement | Implementation | Main files |
|---|---|---|
| Next.js (TypeScript) | Next.js 16.4, React 19.3, TS 5.9 strict | `frontend/` |
| FastAPI | FastAPI 0.118 + Uvicorn | `backend/app/main.py`, `backend/app/routers/` |
| SQLite | SQLAlchemy 2.0 models, WAL mode, foreign keys ON | `backend/app/db.py`, `backend/app/models.py` |
| Login / logout / session persistence | bcrypt password, random session token in an httpOnly cookie, sessions stored in DB | `services/auth.py`, `routers/auth.py`, `frontend/src/app/login/`, `frontend/src/proxy.ts` |
| Hosted zones: view, search, create, edit, delete | Table with property filter, create form, edit form, delete modal with guard | `services/zones.py`, `components/hosted-zones/` |
| DNS records: view, search, create, edit, delete | Records table + split panel, Quick create (multi-row), edit, bulk delete | `services/records.py`, `services/validation.py`, `components/records/` |
| Navigation, tables, forms, search, filters, pagination, modals, notifications | Cloudscape AppLayout, SideNavigation, Table, PropertyFilter, Pagination, Modal, Flashbar | `components/shell/`, `components/common/tableConfig.tsx`, `components/notifications/` |
| Mocked sections (Dashboard, Traffic policies, Health checks, Resolver, Profiles) | Dashboard and Health checks are fully built; the rest show a "Coming soon" page | `app/route53/v2/home/`, `app/route53/v2/healthchecks/`, `app/route53/v2/[...slug]/` |
| Bonus: BIND import | dnspython parser, preview (dry run), then one atomic batch | `services/bind.py`, `ImportZoneFileModal.tsx` |
| Bonus: JSON/BIND export | Per zone, and for all or selected zones | `services/bind.py`, `routers/import_export.py`, `routers/hosted_zones.py` |
| Bonus: dark mode | Cloudscape `applyMode`, saved in localStorage, applied before first paint | `lib/theme.ts`, `components/shell/TopNav.tsx` |
| Bonus: keyboard shortcuts | Global key handler, help modal on `?` | `components/shell/ShortcutsProvider.tsx`, `lib/shortcuts.ts` |
| Bonus: bulk operations | Multi-select delete for zones, records and health checks (each atomic); multi-row create | `DeleteZoneModal.tsx`, `DeleteRecordsModal.tsx`, `DeleteHealthChecksModal.tsx` |
| README: setup, architecture, schema, API | Done, with Mermaid diagrams and screenshots | `README.md` |
| Hosted demo link | Render blueprint ready (`render.yaml`); deploying needs your account | `render.yaml` |

---

## 3. Key decisions and why

### 3.1 Cloudscape for the UI (most important decision)
- **What:** `@cloudscape-design/components`, `global-styles`, `collection-hooks`, `design-tokens`.
- **Why:** The assignment says the look and feel should match Route 53 exactly. Cloudscape is the design system AWS
  built its console with and later open-sourced (Apache-2.0). Using it gives the real console's table, property
  filter, pagination, split panel, flashbar, help panel, wizard and dark mode, instead of imitating them with CSS.
- **Alternatives rejected:** Tailwind / MUI / shadcn. You would have to hand-build every AWS component and it would
  still look slightly wrong ("AWS-coloured CRUD app").
- **Trade-off:** Cloudscape ships ESM with CSS modules, so Next.js needs `transpilePackages` for it
  (`next.config.ts`). All Cloudscape components are used in `"use client"` components.

### 3.2 Next.js App Router with URLs that mirror the real console
- Real console URLs look like `/route53/v2/hostedzones`, so the routes are `app/route53/v2/...`.
- `app/route53/v2/layout.tsx` mounts the shell (top nav, providers, footer) once, so it doesn't re-mount on
  navigation. Each page renders its own `AppLayout` through `ConsolePage` (breadcrumbs, side nav, help drawer, split
  panel differ per page).
- **Next.js 16 renamed `middleware.ts` to `proxy.ts`.** `src/proxy.ts` redirects signed-out users to `/login` and sends `/` to the Dashboard (`/route53/v2/home`), which is also where sign-in lands unless a `?next=` page was requested.
- Pages that read `useSearchParams` are wrapped in `<Suspense>`, which the production build requires.
- **The UI renders in the browser only** (`components/AppProviders.tsx`). Some Cloudscape components (e.g. the
  table's sticky scrollbar, the visual-refresh check) read the real browser layout and theme while rendering, so
  their server HTML can never match the client's and React reports a hydration error. Every page here is behind
  login with nothing to index, so server rendering bought nothing; rendering client-side removes the whole class of
  mismatch. The login redirect still happens on the server (`proxy.ts`). Trade-off: a blank first paint for a
  moment, and no SEO, neither of which matters for an authenticated console.

### 3.3 Same-origin API through a Next.js rewrite
- `next.config.ts` rewrites `/api/*` → `BACKEND_URL/api/*`.
- **Why:** The browser only ever talks to the Next.js origin. The session cookie is first-party, so there is no CORS
  configuration and no third-party cookie problem. This also works when deployed (frontend and backend on different
  hosts).

### 3.4 Authentication design (mocked but done properly)
- Demo user is seeded; password hashed with **bcrypt** (used directly, not `passlib`, which is unmaintained and breaks
  with bcrypt ≥ 4.1).
- On login, the server creates a random token (`secrets.token_urlsafe(32)`), stores only its **SHA-256 hash** in the
  `sessions` table, and sets the raw token in an **httpOnly, SameSite=Lax** cookie `r53_session` (`Secure` when
  `SESSION_COOKIE_SECURE=true`, i.e. in production). Sessions expire after 7 days; expired ones are cleaned up on login.
- **Why hash the token:** if the database leaks, stored tokens can't be replayed (same idea as hashing passwords).
- **Why httpOnly:** JavaScript can't read the cookie, which limits XSS damage.
- **Two layers of protection:** `proxy.ts` only checks that the cookie *exists* (fast redirect). The real check is
  `get_current_user` in the API, which returns 401 for an invalid or expired token; the frontend's `api.ts` then
  redirects to `/login?next=...`.
- Logout deletes the session row, so an old cookie can't be reused (there is a test for this).
- Root user (email) and IAM user (account ID + user name) sign-in are both supported, like the real sign-in page.

### 3.5 API modelled on the real Route 53 API
- Records are changed only through `POST /hostedzones/{id}/rrset`, which is **ChangeResourceRecordSets**: a batch of
  `CREATE`, `UPSERT` and `DELETE` changes applied atomically.
- **Why:** It's how Route 53 really works, and it maps naturally onto the UI: Quick create with several rows is one
  batch; edit is an `UPSERT`; bulk delete is one batch of `DELETE`s.
- Errors look like Route 53's: `{"error": {"code": "InvalidChangeBatch", "message": "...", "field": "changes[2].values[0]"}}`.
  The `field` path lets the frontend show the error on the exact row and field.
- Other Route 53 behaviours copied: zone IDs `Z` + 20 chars, change IDs `C` + 20 chars, change status `PENDING` →
  `INSYNC`, `HostedZoneNotEmpty`, `HealthCheckInUse`, `NoSuchHostedZone`, `\052` escaping for `*` in names.

### 3.6 SQLite details
- **WAL mode and `foreign_keys = ON`** are set on every connection (`db.py`). SQLite doesn't enforce foreign keys
  unless you turn them on per connection; WAL allows reads during writes.
- Tables are created on startup (`create_all`), and an empty database is seeded automatically, so a fresh clone
  works with no extra steps. `python -m app.seed --reset` reseeds.
- Tests use a temporary database file, never `route53.db`.

### 3.7 SWR for data fetching
- Small, typed, handles caching and revalidation. After a mutation the relevant keys are revalidated
  (`mutate(keys.zones)` etc.). Deletes update the cache optimistically, then revalidate.
- Health checks poll every 15 s, because their status changes on its own (Unknown → Healthy).

### 3.8 Validation written twice, on purpose
- Server rules live in `backend/app/services/validation.py`; `frontend/src/lib/validators.ts` mirrors them rule for
  rule and **message for message**.
- **Why both:** the client gives instant inline errors; the server is the source of truth (never trust the client).
  Because the messages match, a user sees the same text whichever side catches the error.

### 3.9 Zero cost
- Only open-source dependencies, no paid APIs, no AWS account. Hosting uses Render's free tier.

### 3.10 Versions chosen
- Latest stable at build time: Next 16.4.0, React 19.3.0, Cloudscape 3.0.1396, FastAPI 0.118.0, SQLAlchemy 2.0.43,
  Pydantic 2.11.9, dnspython 2.8.0, bcrypt 5.0.0, Python 3.12.
- **TypeScript 5.9.3, not 7.x:** TypeScript 7 is the new Go-based compiler; Next.js tooling may not support it yet.
- Versions are pinned exactly in `package.json` and `requirements.txt` for reproducible builds.

---

## 4. Architecture

```
Browser
  │  pages + /api/* (same origin, httpOnly cookie)
  ▼
Next.js 16 (frontend/)
  - proxy.ts: redirect to /login if no session cookie
  - Cloudscape UI, SWR data fetching
  - rewrites /api/* ──────────────┐
                                  ▼
                       FastAPI (backend/app)
                         routers/   → HTTP only: parse request, call a service, shape response
                         services/  → business rules: validation, change batches, BIND, health checks
                         models.py  → SQLAlchemy tables
                                  ▼
                       SQLite (route53.db, WAL, FKs on)
```

**Layering rule:** routers never contain business logic; services never know about HTTP. That keeps the rules
testable on their own and the routers thin.

### A request, end to end (creating two records)
1. User fills two rows in **Quick create** and clicks **Create records**.
2. `validateRow` runs client-side for each row; if anything fails, errors show inline and the page scrolls to the first.
3. `useRecordSubmit` sends one `POST /api/v1/hostedzones/{id}/rrset` with two `CREATE` changes.
4. Next.js rewrites it to FastAPI. `get_current_user` reads the cookie, hashes it, looks up the session.
5. `get_owned_zone` loads the zone and checks the user owns it (404 otherwise, so you can't probe other users' IDs).
6. `apply_change_batch` simulates both changes, checks zone-wide rules, writes everything in one transaction,
   updates `record_count`, records a `changes` row, commits.
7. Response contains `change_info` with status `PENDING`. The UI shows a success flash and a "Change status: PENDING"
   flash that polls `GET /changes/{id}` until it says `INSYNC` (about 2 s).
8. SWR revalidates the records, zone and zone list; the user is sent back to the zone page.

---

## 5. Repository structure

```
README.md            Setup, architecture, schema, API, features (assignment deliverable)
PLAN.md              The implementation plan the project followed
PROJECT_GUIDE.md     This file
render.yaml          Free deployment blueprint (Render): API + web app
dev.ps1              Starts backend + frontend together on Windows
docs/screenshots/    Light and dark screenshots used in the README

backend/
  requirements.txt   Pinned Python dependencies
  .env.example       All settings with local defaults
  pytest.ini
  app/
    main.py          FastAPI app, exception handlers, router registration, startup (create tables + seed)
    config.py        pydantic-settings: DATABASE_URL, SESSION_COOKIE_SECURE, CORS_ORIGINS, AUTO_SEED, ...
    db.py            Engine, SQLite PRAGMAs, session factory, get_db dependency
    models.py        All tables (users, sessions, hosted_zones, zone_vpcs, zone_tags, record_sets,
                     resource_records, changes, health_checks, health_check_tags)
    errors.py        ApiError / FieldError → Route 53-style error JSON
    deps.py          get_current_user, get_owned_zone (auth + ownership checks)
    seed.py          Demo user, 3 hosted zones (28 record sets including the NS/SOA pairs), 4 health checks
    schemas/         Pydantic request/response models (auth, zones, records, health_checks, common)
    routers/         auth, dashboard, hosted_zones, records, changes, import_export, health_checks
    services/
      auth.py          bcrypt, session create/lookup/delete
      zones.py         create (with NS/SOA), list/search/sort/page, update, tags, delete + bulk delete
      records.py       Draft model, normalisation, the atomic change-batch engine, listing
      validation.py    Domain-name rules and per-type value validators
      bind.py          Zone file parsing (dnspython) and JSON/BIND export
      health_checks.py Validation, simulated status, checker observations, metrics, in-use guard
      changes.py       Change rows and PENDING/INSYNC status
      ids.py           Z.../C... ID generation
      nameservers.py   Deterministic 4-server delegation set
  tests/             conftest (temp DB, logged-in client), auth, zones, records, validation, bind, health checks

frontend/
  next.config.ts     transpilePackages for Cloudscape, /api rewrite
  src/proxy.ts       Login redirect (Next.js 16 name for middleware)
  src/app/
    layout.tsx       Global Cloudscape CSS, theme boot script, AppProviders (client-only render + I18nProvider)
    login/           Mock AWS sign-in page (root / IAM user, two steps)
    route53/v2/
      layout.tsx     ConsoleShell (top nav, providers, footer)
      home/          Dashboard
      hostedzones/   List, create, [zoneId] detail, edit, records/create, records/[recordKey]/edit
      healthchecks/  List, create (wizard), [healthCheckId]/edit
      [...slug]/     "Coming soon" for every other side-nav link
  src/components/
    shell/           TopNav, SideNav, ConsoleShell, ConsolePage (AppLayout wrapper), Footer, ShortcutsProvider
    notifications/   FlashbarProvider (notifications + change-status tracking)
    help/            Help panel provider and all help topics (Info links)
    common/          Table preferences, empty states, URL-synced filters, TagEditor, Coming soon, InfoLink
    hosted-zones/    ZonesTable, ZoneForm, ZoneDetails, ZoneTabs, DeleteZoneModal, mock VPCs
    records/         RecordsTable, RecordForm, RecordFields, RecordWizard, split panel, delete/import/test modals,
                     recordRow.ts (form state ↔ API), recordItem.tsx (table rows), recordTypes.ts
    health-checks/   Table, split panel with tabs, charts, form fields, wizard/edit form, delete modal
  src/hooks/         SWR hooks: useSession, useZones, useRecords, useHealthChecks, useLocalStorage
  src/lib/           api.ts (typed client), types.ts, validators.ts, format.ts, theme.ts, shortcuts.ts, download.ts

e2e/                 Playwright tests (7) and the screenshot script
```

---

## 6. Database design

| Table | Purpose and notable choices |
|---|---|
| `users` | Demo account. `email` unique, mock 12-digit `account_id`, bcrypt `password_hash`. |
| `sessions` | `token` is the SHA-256 of the cookie value (primary key), `expires_at`. Cascade-deleted with the user. |
| `hosted_zones` | `id` like `Z0812345ABCDEFGHIJKLM`. `name` stored **lower-case with a trailing dot** (`example.com.`), as DNS and the Route 53 API do. `caller_reference` unique per owner (Route 53 uses it to make create idempotent). `record_count` is **denormalised**. `name_servers` is a JSON array. |
| `zone_vpcs` | VPC associations for private zones. Unique (zone, vpc, region). |
| `zone_tags` | Composite primary key (zone_id, key): a key can appear once per zone. |
| `record_sets` | One row per record set: name, type (CHECK constraint on the 13 types), TTL (NULL for alias), routing policy and its fields, `health_check_id`, `alias_target` (JSON), `is_default` (the auto NS/SOA). |
| `resource_records` | One row per value line, with `position` to keep the user's order. |
| `changes` | Audit trail of every change batch: ID, zone, comment, time, full JSON payload. |
| `health_checks` | UUID IDs like Route 53. Type CHECK constraint. Endpoint fields, calculated fields (`child_health_checks` JSON, `health_threshold`), CloudWatch alarm (JSON), `notification` (JSON), `version`. |
| `health_check_tags` | Composite key (health_check_id, key). |

**Questions you may get about the schema:**
- **Why a separate `resource_records` table instead of a JSON array of values?** A record set has many values
  (e.g. 4 name servers, several MX lines). A child table is the normalised form, keeps order with `position`, and lets
  you query values. JSON is used only for small nested structures that are always read whole (alias target, geo location).
- **How is "a record is unique by (name, type, Record ID)" enforced?** A unique index on
  `(zone_id, name, type, COALESCE(set_identifier, ''))`. A plain UNIQUE constraint wouldn't work because SQLite treats
  NULLs as distinct, so two simple records with NULL set identifiers would both be allowed.
- **Why is `record_count` stored instead of counted?** The zones list shows it for every zone; storing it avoids a
  count query per zone. It is updated in the same transaction as the change, so it can't drift.
- **Why store names with a trailing dot?** It's the fully qualified DNS form Route 53 uses in its API. It makes
  "is this name inside the zone" a simple suffix check. The UI strips the dot when displaying.
- **Cascades:** deleting a zone deletes its records, values, tags and VPCs (`ON DELETE CASCADE`); its `changes` rows
  keep the audit trail (`ON DELETE SET NULL`).

---

## 7. Backend deep dive

### 7.1 Creating a hosted zone (`services/zones.py`)
1. Normalise and validate the name (lower-case, trailing dot, ≤253 chars, labels 1–63 chars of `a-z 0-9 - _`).
2. Validate description (≤256), tags (≤50, unique keys, no `aws:` prefix), and VPCs (required for private zones,
   not allowed for public ones).
3. Reject a reused `caller_reference` with 409 `HostedZoneAlreadyExists`.
4. Generate the zone ID, pick 4 name servers **deterministically** from the ID (`nameservers.py`: one each in .com,
   .net, .org, .co.uk, numbered like real Route 53 delegation sets), create the **NS (TTL 172800)** and
   **SOA (TTL 900)** records with `is_default=True`, set `record_count = 2`.
5. Duplicate zone names are allowed (Route 53 allows them); the UI shows an info alert.

### 7.2 The change-batch engine (`services/records.py`, `apply_change_batch`)
This is the most important backend function. Algorithm:
1. Load every record set of the zone into an in-memory dict keyed by `(name, type, set_identifier)`.
2. For each change, in order:
   - Normalise and validate the record set (`normalize_record_set`): type, name inside the zone, CNAME not at the apex,
     SOA only at the apex, alias rules (allowed types, no TTL), TTL range, per-type values, routing-policy fields
     (e.g. weighted needs a weight 0–255 and a Record ID).
   - Check that a referenced health check exists and belongs to the user.
   - Apply it to the in-memory state: `CREATE` fails if it already exists; `DELETE` fails if it's missing or is a
     default NS/SOA; `UPSERT` creates or replaces (and keeps NS/SOA marked as default).
   - Collect every error with its field path (`changes[i].values[j]`) instead of stopping at the first.
3. Check zone-wide rules on the final state: **no CNAME alongside other types at the same name**, and **all records
   with the same name and type use the same routing policy**.
4. If there are any errors, raise one `InvalidChangeBatch` with all of them. Nothing has been written.
5. Otherwise write only the touched keys (insert, update in place, or delete), update `record_count`, add a
   `changes` row, and commit once.

**Why simulate first, then write?** It guarantees atomicity and gives complete error lists. It also handles batches
like "DELETE x then CREATE x" correctly, because each change sees the effect of the previous ones.

**Edit with a changed Record ID:** the identity changes, so the frontend sends `DELETE old` + `CREATE new` in one
batch instead of an `UPSERT` (which would leave the old record behind).

### 7.3 Per-type validation (`services/validation.py`)
| Type | Rule |
|---|---|
| A / AAAA | Valid IPv4 / IPv6 (Python `ipaddress`) |
| CNAME | Exactly one domain name; not at the apex; can't coexist with other types |
| TXT / SPF | One or more double-quoted strings, each ≤255 chars, total ≤4000 |
| MX | `priority host`, priority 0–65535 |
| NS / PTR | Domain names |
| SRV | `priority weight port target`, each 0–65535 |
| CAA | `flags tag "value"`, flags 0–255, tag in issue / issuewild / iodef / issuemail / issuevmc |
| SOA | 7 fields, edit only |
| DS / NAPTR | Their standard formats |
Plus: TTL 0–2147483647, no duplicate values, wildcards only as the leftmost label.

### 7.4 Errors (`errors.py`, `main.py`)
- `ApiError(status, code, message, field, errors)` is raised from services and turned into JSON by one exception
  handler. Pydantic validation errors (422) and HTTP errors are reshaped into the same format, so the frontend parses
  one error shape everywhere.
- Status codes: 400 business-rule errors, 401 not signed in, 404 not found / not yours, 409 conflict, 422 malformed request.

### 7.5 Ownership and isolation
- Every zone and health check lookup checks `owner_id`. Another user's resources return **404, not 403**, so their
  existence isn't revealed. There are tests that log in as a second user and check this.

### 7.6 BIND import/export (`services/bind.py`)
- Import uses `dns.zone.from_text(..., relativize=False, check_origin=False)`; SOA and apex NS are skipped (as the
  console does); unsupported types are reported as skipped. `?dry_run=true` returns a preview; otherwise all records
  are created in **one atomic batch** (so a duplicate makes the whole import fail, nothing half-imported).
- Export produces either `ListResourceRecordSets`-shaped JSON or a zone file with `$ORIGIN`/`$TTL`. Alias records
  can't be expressed in BIND, so they're written as comments. A test checks that an export can be re-imported.

### 7.7 Health checks (`services/health_checks.py`)
- Types: HTTP, HTTPS, HTTP/HTTPS with string matching, TCP, CALCULATED (based on other checks), CLOUDWATCH_METRIC.
- Rules copied from Route 53: you can't change the type, protocol, request interval or latency graphs after
  creation; at least 3 health checker Regions if you customise them; failure threshold 1–10; a calculated check can't
  monitor itself; you can't delete a check that a record or a calculated check uses (`HealthCheckInUse`).
- **Status is simulated** because nothing is really probed: Unknown for the first 8 seconds; endpoints in
  203.0.113.0/24 (a documentation-only IP range) or with a host name starting `down.` / containing `unhealthy` are
  Unhealthy, everything else Healthy; calculated checks count healthy children; disabled checks are always Healthy
  (as in Route 53); "invert" flips the result. Checker observations and the last hour of metrics are generated
  deterministically from the check's ID, so they look the same on every refresh.

### 7.8 Change status (`services/changes.py`)
- Each change is stored with a timestamp; its status is **computed on read**: `INSYNC` once more than 2 seconds have
  passed, otherwise `PENDING`. No background job is needed.

---

## 8. Frontend deep dive

### 8.1 The console shell
- `ConsoleShell` (mounted once): `FlashbarProvider` → `HelpPanelProvider` → `ShortcutsProvider` → `TopNav` + page + `Footer`.
- `ConsolePage` (per page): Cloudscape `AppLayout` with side navigation, breadcrumbs, the flashbar in the
  notifications slot, the help panel in the tools drawer, and an optional split panel. Navigation open/closed state
  and split-panel position are remembered in localStorage.
- `TopNav`: AWS logo, Services menu, zone search (Alt+S), CloudShell/notifications/help/settings icons, a "Global"
  region menu (regions disabled, as Route 53 is global), and the account menu: Organization, Billing, Security
  credentials (mocks), **Export all hosted zones** (JSON or BIND), **Keyboard shortcuts**, **Visual mode**
  (Light / Dark / Browser default, in sync with the Settings gear menu) and Sign out.
- `SideNav`: the real Route 53 navigation tree; the section containing the current page is expanded.

### 8.2 Tables
- All tables use `useCollection` from `@cloudscape-design/collection-hooks` for filtering, sorting and pagination.
  Lists are fetched once and handled client-side (fine for thousands of rows); the API also supports server paging.
- **Property filter query is stored in the URL** (`?filter=...`), so filters survive a reload and can be shared.
- **Preferences** (page size, wrap lines, striped rows, compact mode, column visibility and order) are saved in
  localStorage per table.
- Records table adds three extra dropdown filters (Type, Routing policy, Alias), like the real console.

### 8.3 Forms
- `ZoneForm` handles both create and edit (name and type disabled in edit).
- `RecordForm` is Quick create (many rows) or Edit (one row, name and type read-only). `RecordFields` is one row's
  fields and is reused by the wizard.
- `recordRow.ts` converts between form state (strings, as typed) and the API shape, and maps server error paths like
  `changes[2].values[0]` back to row 2's Value field.
- On submit errors the page scrolls to and focuses the first field marked `data-has-error`.

### 8.4 Notifications
- One global `FlashbarProvider`; any component calls `useNotify().success(...)`. Messages persist across navigation
  (so "zone created" still shows on the zone page).
- `trackChange(change)` shows an in-progress "Change status: PENDING" flash and polls the API until `INSYNC`.

### 8.5 Dark mode
- `applyMode` from Cloudscape global styles; the choice (Light / Dark / Browser default) is saved in localStorage.
- A tiny inline script in `<head>` applies dark mode **before the first paint** to avoid a white flash.

### 8.6 Keyboard shortcuts
- One `keydown` listener in `ShortcutsProvider`. Pages register handlers with `useShortcuts({create, refresh, delete, ...})`;
  the Dashboard, Hosted zones, zone detail and Health checks pages all register `c` and `r`.
- Single-key shortcuts are ignored while typing in a field and while a modal is open; `Alt+S` and `Esc` work
  everywhere. `?` opens the list. `Delete` also accepts `Backspace` (the Mac delete key).
- **Alt+S gotcha:** Cloudscape's `TopNavigation` renders a hidden copy of the search slot to measure the layout, so a
  plain `querySelector` focuses the invisible input. `focusTopSearch` picks the *visible* input, and on narrow screens
  (where search collapses to an icon) clicks the icon first.

### 8.7 Charts (health checks)
- Cloudscape `LineChart`: it uses the console's validated data-visualisation colours, has a hover tooltip and works in
  dark mode. Status and latency are **two separate single-series charts**, never one chart with two y-axes.

---

## 9. How the project was built (steps in order)

1. **Read the assignment and wrote a plan (`PLAN.md`)** with phases and acceptance checks for each.
2. **Environment:** Python wasn't on PATH, so a Python 3.12 virtual environment was created with `uv`.
3. **Backend first** (the API is the contract the UI depends on): config → database → models → services
   (validation, zones, change batches, BIND) → routers → seed → tests. 81 tests passed, ~93% coverage of services.
4. **Frontend scaffold** written by hand (no interactive `create-next-app`); checked the Cloudscape type definitions
   in `node_modules` to use the exact prop names.
5. **Frontend build-out:** types and API client → validators mirroring the backend → providers (flashbar, help,
   shortcuts, theme) → shell → login → hosted zones → zone details and records → record forms → wizard → import/export.
6. **Verified in a real browser** with Playwright: screenshots of every page, then fixed what looked wrong
   (serif font in the footer, truncated columns).
7. **Wrote the end-to-end test** of the full walkthrough (sign in → zone → 9 record types → edit → bulk delete →
   delete zone → sign out → sign in).
8. **Docs:** README with Mermaid diagrams, screenshots in light and dark mode.
9. **Second round, after comparing with the assignment:** added bulk zone delete and all-zones export (bonus items
   that were partial), built the Dashboard and Health checks sections, added a Render deployment blueprint and
   `PLAN.md`, extended tests to 103 backend and 6 end-to-end, made the first git commit.
10. **Third round, from using the site:** Light/Dark/Export/Shortcuts entries in the account menu; fixed the
    hydration errors and the broken Alt+S; added `c`/`r` shortcuts to the Dashboard; then a dead-code pass
    (compiler `--noUnusedLocals`, `ruff`, and a search for unused exports/API methods) that removed six unused API
    client methods and two unused schemas, and a final full test run.

### Problems hit and how they were solved (good interview material)
| Problem | Cause | Fix |
|---|---|---|
| `TypeError: 'NoneType' object is not callable` on import | A dataclass attribute named `field` shadowed `dataclasses.field` inside the class body | Imported the module (`dataclasses.field(...)`) |
| `-` accepted as a valid domain-name value | Label regex allowed labels made only of hyphens | Labels can't start or end with a hyphen; caught by a parametrised test |
| Wrong module loaded for `./RecordRow` | `recordRow.ts` and `RecordRow.tsx` are the same file name on Windows' case-insensitive filesystem | Renamed the table helper to `recordItem.tsx` |
| Pages showed "This page couldn't load" after a rebuild | An old Next.js server process was still running and serving deleted build files | Killed the process by port and restarted |
| Route matching: `/hostedzones/export` treated as a zone ID | FastAPI matches routes in registration order | Registered `/export` and `/batch-delete` before `/{zone_id}` |
| `middleware.ts` ignored | Next.js 16 renamed it | Used `src/proxy.ts` |
| Hydration error: `<body className="awsui-dark-mode">` mismatch | The dark-mode boot script adds the class before React loads | `suppressHydrationWarning` on `<body>` (as already on `<html>`) |
| Hydration error on `StickyScrollbar` class names | Cloudscape reads the real browser layout/theme while rendering | Render the UI client-only (`AppProviders`), see 3.2 |
| React warning "Each child in a list should have a unique key" | `{error && <X/>}` with `error === ''` renders an empty text node inside Cloudscape's child list | Use real booleans: `{!!error && <X/>}` |
| Alt+S did nothing | Focused the hidden measuring copy of the search input in `TopNavigation` | Focus the visible input only |
| Tests failed in dev mode only | The Next.js dev-tools "N" button also matches a `Next` button locator | Exact-name locators (`{ exact: true }`) |

---

## 10. Testing strategy

- **Backend (pytest, 103 tests):** each test gets a fresh temporary SQLite database with two users. Covers auth
  (cookie flags, logout invalidates the token, IAM login), zones (validation, NS/SOA creation, pagination, delete
  guard, per-user isolation, bulk delete atomicity, export), records (every type valid and invalid, atomic batches,
  duplicates, CNAME rules, NS/SOA protection, wildcards, alias, every routing policy, change status), BIND
  (import/preview/round-trip), validation units, and health checks (status rules, validation, update rules, in-use
  guard, metrics, dashboard). Run: `cd backend && pytest --cov=app/services`.
- **End-to-end (Playwright, 7 tests)** against the running app: the full zone/record lifecycle, every side-nav link,
  filters + URL persistence + help panel + shortcuts, dashboard, health check lifecycle, bulk zone delete and export.
- **Why both:** unit/API tests prove the rules; browser tests prove the UI actually wires them up.

---

## 11. Deployment

- `render.yaml` defines two free services: `route53-clone-api` (Python) and `route53-clone-web` (Node).
- The web service's `BACKEND_URL` points at the API; the Next.js rewrite keeps everything same-origin for the browser.
- `SESSION_COOKIE_SECURE=true` in production, so the cookie is only sent over HTTPS.
- **Limitation:** Render's free disk is ephemeral, so SQLite is reset and re-seeded on restart. For durable data you
  would attach a persistent disk or move to Postgres (only `DATABASE_URL` would change, since everything goes through
  SQLAlchemy).

---

## 12. Known limitations and what I'd do next

- No real DNS: nothing is served; "Test record" answers from the database.
- Routing policies and alias targets are stored and validated but not evaluated; health checks are simulated.
- Single demo user; VPCs, SNS topics and CloudWatch alarms are mock lists.
- Lists are filtered client-side (fine up to thousands of records).
- The UI is client-rendered (no SSR/SEO), a deliberate choice for a logged-in console (see 3.2).
- **Next steps:** Alembic migrations instead of `create_all`; Postgres for production; server-side paging/filtering
  in the UI for very large zones; rate limiting on login; CSRF token if the API were ever called cross-site
  (SameSite=Lax already blocks the common cases); compare pixel-by-pixel with real console screenshots.

---

## 13. Likely questions and short answers

**Why Cloudscape and not Tailwind/MUI?**
The brief asks for the same look and feel as Route 53. The real console is built with Cloudscape, which AWS
open-sourced, so it gives the exact components instead of imitations.

**How does login work? Is it secure?**
bcrypt-hashed password; on success a random token goes into an httpOnly, SameSite=Lax cookie, and only its SHA-256
hash is stored in the sessions table with an expiry. Every API call looks the session up; logout deletes it. It's
mocked (one demo user) but uses the same patterns as a real app.

**How do sessions persist across reloads?**
The cookie survives reloads and browser restarts (7-day max age) and sessions are in SQLite, so they also survive
backend restarts.

**What happens if one record in a batch of five is invalid?**
Nothing is written. The engine validates all five against an in-memory copy first, returns every error with its
field path, and the UI shows each error on its row.

**How do you stop someone deleting the default NS/SOA records?**
They're flagged `is_default`. The engine rejects `DELETE` for them; the UI also disables Delete when they're selected.
They can still be edited via `UPSERT`, like in Route 53.

**Why can't a hosted zone with records be deleted?**
Route 53 behaves this way (`HostedZoneNotEmpty`) to prevent accidental data loss. Bulk delete is all-or-nothing too.

**Why is CNAME at the apex rejected?**
DNS rules: a CNAME can't coexist with other records at the same name, and the apex always has NS and SOA.

**How do you keep frontend and backend validation in sync?**
`validators.ts` mirrors `validation.py` with the same rules and messages; the server always re-validates, and tests
cover the server rules.

**Why SWR?**
Simple caching and revalidation with typed hooks; after each mutation the affected keys are refreshed.

**Why is the API proxied through Next.js?**
Same origin for the browser: first-party cookie, no CORS, no third-party cookie issues once deployed.

**How are IDs and name servers generated?**
Zone IDs are `Z` + 20 random uppercase alphanumerics, change IDs `C` + 20, health check IDs UUIDs, matching Route 53's
formats. Name servers are derived from a hash of the zone ID, one per TLD (.com, .net, .org, .co.uk), so they're
stable for a zone.

**How is the "PENDING → INSYNC" status done without a background worker?**
It's computed when read: if more than 2 seconds have passed since the change was submitted, it's INSYNC.

**How would you scale this?**
Postgres instead of SQLite, Alembic migrations, server-side pagination and filtering, an index on record names,
and moving long-running work (imports) to a job queue.

**Why is the UI rendered only in the browser? Isn't SSR the point of Next.js?**
Cloudscape components read the real browser layout and theme while rendering, so server HTML never matches the
client and React logs hydration errors. This is a logged-in console with nothing to index, so SSR gives no benefit;
I keep Next.js for routing, the `/api` proxy and the server-side login redirect, and render the UI client-side.

**How do you know there's no dead code?**
`tsc --noUnusedLocals --noUnusedParameters`, `ruff` (pyflakes rules), plus a search for exports, API-client methods
and help topics that nothing references. The remaining unreferenced names are framework conventions (`metadata`,
`config`) and route handlers registered by decorators.

**What was the hardest part?**
The atomic change-batch engine: making sequential changes in one batch see each other's effects, enforcing
zone-wide rules (CNAME conflicts, consistent routing policies) on the final state, and mapping every error back to
the exact form field.

**What would you improve?**
Pixel-level comparison with the real console, migrations, Postgres for persistent hosting, and more end-to-end
coverage of edge cases (alias records, routing policies) in the browser.
