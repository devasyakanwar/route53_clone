# Route 53 Clone: Implementation Plan

> **For the AI coding tool:** this is the plan to implement. Do the phases in order. Each phase ends with acceptance checks, and every check must pass before you start the next phase. When this plan doesn't settle a UI question, copy what the real AWS Route 53 console does (see §2 References) instead of inventing something. **The main goal is that it looks and behaves like the real console.** A generic CRUD app with an AWS-ish colour scheme does not meet it.

---

## 0. Key decisions (read first)

| Decision | Choice | Why |
|---|---|---|
| UI component library | **Cloudscape Design System** (`@cloudscape-design/components`, `@cloudscape-design/global-styles`, `@cloudscape-design/collection-hooks`) | It is AWS's own open-source design system and the actual Route 53 console is built on it. Using it gets you the same tables, property filter, pagination, modals, flashbars, split panel, and dark mode. **Do not hand-roll AWS look-alike CSS. Do not use Tailwind, MUI, or shadcn for console UI.** |
| Frontend | Latest stable Next.js (App Router) + React + TypeScript (strict) | Required by the assignment. All Cloudscape components go in `"use client"` components. Pin exact versions in `package.json` once it builds. |
| Backend | Python 3.11+, FastAPI + Uvicorn + SQLAlchemy 2.0 + Pydantic v2 + pydantic-settings | Required. Typed, auto-generates OpenAPI docs at `/docs`. |
| Password hashing | `bcrypt` package directly (or `pwdlib`), **not `passlib`** | `passlib` is unmaintained and breaks with bcrypt ≥ 4.1. |
| Data fetching | SWR | Small, typed, simple to revalidate after mutations. |
| Testing | pytest + httpx `TestClient` (backend); optional Playwright (frontend) | |
| DB | SQLite (WAL mode, foreign keys ON) | Required. |
| API transport | Next.js `rewrites` proxy `/api/*` → FastAPI | Keeps the browser on one origin (`localhost:3000`), so cookies work with no CORS setup. |
| Auth | Mock: seeded demo user, opaque session token in an httpOnly cookie, sessions stored in the DB | Satisfies login, logout, and session persistence. |
| DNS parsing | `dnspython` | BIND zone file import/export and value validation. |
| API semantics | Follows the real Route 53 API (`ChangeResourceRecordSets` with CREATE / UPSERT / DELETE) behind REST endpoints | Shows good backend/API design, and the UI's batch "Create records" maps onto it naturally. |
| **Cost** | **$0. Every tool and library in this plan must be free.** | Hard requirement. See §0.1. |
| **Scope of this plan** | **Local build only.** Everything runs on the developer's machine. | Hosting is deferred to later (see §10). |

### 0.1 Zero-cost rules (hard requirement)
- **Libraries**: only open-source packages (Cloudscape is Apache-2.0; Next.js, FastAPI, SQLAlchemy, and dnspython are MIT/BSD). Don't add paid SaaS, paid UI kits, paid icon packs, or paid fonts.
- **No paid APIs**: don't call LLM APIs, map APIs, email services, or analytics. Everything AWS-related (accounts, VPCs, billing, health checks) is mocked locally.
- **No AWS account needed**: build from the free references in §2 (the AWS docs, Cloudscape's live demos, and screenshots). If you do want to look at the real console, opening the Route 53 pages costs nothing. Only *creating* a hosted zone costs $0.50/month, and AWS doesn't charge for a zone that's deleted within 12 hours of being created. Don't create health checks, register domains, or turn on query logging.
- **Code hosting**: a GitHub repo (free).
- Keep all config in env vars (`DATABASE_URL`, `SESSION_COOKIE_SECURE`, `BACKEND_URL`, `CORS_ORIGINS`) with local defaults, so hosting later needs no code changes.

---

## 1. Repository layout

```
route53-clone/
├── README.md
├── PLAN.md
├── frontend/
│   ├── next.config.ts            # transpilePackages for cloudscape, rewrites /api -> backend
│   ├── middleware.ts             # redirect to /login when no session cookie (named proxy.ts on Next.js 16+)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx                    # imports @cloudscape-design/global-styles/index.css
│   │   │   ├── login/page.tsx                # mock AWS sign-in page
│   │   │   └── route53/v2/                   # mirror real console URLs
│   │   │       ├── layout.tsx                # <ConsoleShell> (TopNav + AppLayout + SideNav)
│   │   │       ├── home/page.tsx             # Dashboard (coming soon)
│   │   │       ├── hostedzones/page.tsx      # Hosted zones list
│   │   │       ├── hostedzones/create/page.tsx
│   │   │       ├── hostedzones/[zoneId]/page.tsx          # zone detail + records
│   │   │       ├── hostedzones/[zoneId]/edit/page.tsx
│   │   │       ├── hostedzones/[zoneId]/records/create/page.tsx
│   │   │       ├── hostedzones/[zoneId]/records/[recordKey]/edit/page.tsx
│   │   │       ├── healthchecks/page.tsx     # coming soon
│   │   │       ├── trafficpolicies/page.tsx  # coming soon
│   │   │       ├── profiles/page.tsx         # coming soon
│   │   │       └── resolver/[...slug]/page.tsx # coming soon
│   │   ├── components/
│   │   │   ├── shell/ (TopNav.tsx, SideNav.tsx, ConsoleShell.tsx, Footer.tsx)
│   │   │   ├── notifications/ (FlashbarProvider.tsx, useNotify.ts)
│   │   │   ├── help/ (HelpPanelProvider.tsx, help-content/*.tsx)
│   │   │   ├── hosted-zones/ (ZonesTable.tsx, DeleteZoneModal.tsx, ZoneForm.tsx, ZoneDetails.tsx)
│   │   │   ├── records/ (RecordsTable.tsx, RecordForm.tsx, RecordRow.tsx, RecordSplitPanel.tsx,
│   │   │   │            DeleteRecordsModal.tsx, ImportZoneFileModal.tsx, recordTypes.ts)
│   │   │   └── common/ (ComingSoon.tsx, TagEditorField.tsx, InfoLink.tsx)
│   │   ├── lib/ (api.ts, types.ts, validators.ts, format.ts, shortcuts.ts, theme.ts)
│   │   └── hooks/ (useZones.ts, useRecords.ts, useSession.ts) # SWR or TanStack Query
│   └── package.json
└── backend/
    ├── app/
    │   ├── main.py               # FastAPI app, routers, exception handlers
    │   ├── config.py             # pydantic-settings
    │   ├── db.py                 # engine, session, PRAGMAs
    │   ├── models.py             # SQLAlchemy models
    │   ├── schemas/              # Pydantic request/response models
    │   ├── routers/ (auth.py, hosted_zones.py, records.py, changes.py, import_export.py)
    │   ├── services/ (zones.py, records.py, validation.py, bind.py, ids.py, nameservers.py)
    │   ├── deps.py               # get_db, get_current_user
    │   └── seed.py               # demo user + sample zones/records
    ├── tests/ (test_auth.py, test_zones.py, test_records.py, test_validation.py, test_bind.py)
    ├── alembic/ (optional)
    ├── requirements.txt
    ├── route53.db                # created on first run (git-ignored)
    └── .env.example
```

---

## 2. References (the AI tool should open and study these)

**Free visual references (no AWS account needed):**
- Cloudscape live demos (real AWS console look: table view, create form, details page, split panel, delete modal): https://cloudscape.design/demos/
- Screenshots throughout the AWS Route 53 Developer Guide pages linked below.
- Public YouTube walkthroughs: search "Route 53 create hosted zone console 2025" and "Route 53 quick create record".

**Real console** (optional and free to *view*; creating a zone costs $0.50/month, but zones deleted within 12 hours aren't charged; see §0.1):
- Hosted zones list: `https://us-east-1.console.aws.amazon.com/route53/v2/hostedzones`
- Dashboard: `https://us-east-1.console.aws.amazon.com/route53/v2/home`

**AWS documentation (behaviour, field names, validation rules, copy text):**
- Working with hosted zones: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/hosted-zones-working-with.html
- Creating a public hosted zone: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/CreatingHostedZone.html
- Supported record types (format of each value): https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/ResourceRecordTypes.html
- Creating records in the console: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating.html
- Values to specify when creating/editing records: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-values.html
- Routing policies: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy.html
- Importing a zone file: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-creating-import.html
- NS and SOA records Route 53 creates: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/SOA-NSrecords.html
- Domain name format: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/DomainNameFormat.html
- Quotas: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/DNSLimitations.html
- API reference, used to shape our API: [CreateHostedZone](https://docs.aws.amazon.com/Route53/latest/APIReference/API_CreateHostedZone.html), [ListHostedZones](https://docs.aws.amazon.com/Route53/latest/APIReference/API_ListHostedZones.html), [ChangeResourceRecordSets](https://docs.aws.amazon.com/Route53/latest/APIReference/API_ChangeResourceRecordSets.html), [ListResourceRecordSets](https://docs.aws.amazon.com/Route53/latest/APIReference/API_ListResourceRecordSets.html), [GetChange](https://docs.aws.amazon.com/Route53/latest/APIReference/API_GetChange.html), [DeleteHostedZone](https://docs.aws.amazon.com/Route53/latest/APIReference/API_DeleteHostedZone.html), [UpdateHostedZoneComment](https://docs.aws.amazon.com/Route53/latest/APIReference/API_UpdateHostedZoneComment.html)

**Cloudscape (how to build the UI):**
- Components index: https://cloudscape.design/components/
- App layout: https://cloudscape.design/components/app-layout/
- Top navigation: https://cloudscape.design/components/top-navigation/
- Side navigation: https://cloudscape.design/components/side-navigation/
- Table: https://cloudscape.design/components/table/
- Property filter: https://cloudscape.design/components/property-filter/
- Collection hooks (filter/sort/paginate): https://cloudscape.design/get-started/dev-guides/collection-hooks/
- Split panel: https://cloudscape.design/components/split-panel/
- Flashbar: https://cloudscape.design/components/flashbar/
- Patterns: [Table view](https://cloudscape.design/patterns/resource-management/view/table-view/), [Create resource](https://cloudscape.design/patterns/resource-management/create/), [Edit](https://cloudscape.design/patterns/resource-management/edit/), [Delete with additional confirmation](https://cloudscape.design/patterns/resource-management/delete/delete-with-additional-confirmation/), [Resource details](https://cloudscape.design/patterns/resource-management/details/)
- Dark mode (`applyMode`): https://cloudscape.design/foundation/visual-foundation/visual-modes/
- Source and demos: https://github.com/cloudscape-design/components, https://github.com/cloudscape-design/demos

**Libraries:** dnspython https://dnspython.readthedocs.io/ · FastAPI https://fastapi.tiangolo.com/ · SQLAlchemy 2.0 https://docs.sqlalchemy.org/en/20/

---

## 3. UI specification (copy the real console)

### 3.1 Global console shell (on every authenticated page)

**Top navigation** (Cloudscape `TopNavigation`, dark header, sticky):
- Left: AWS smile logo (use an SVG of the "aws" wordmark; it links to `/route53/v2/hostedzones`).
- **Services** menu button (grid icon), with a mocked dropdown that lists "Route 53" and a few greyed-out services.
- Search input with placeholder `Search` and the hint `[Alt+S]`. Searching zone names here is a nice extra.
- Right utilities: CloudShell icon (mock), Notifications bell, Help (?) icon, Settings gear (it opens **Visual mode: Light / Dark / Browser default**, which is the dark-mode bonus), region selector showing **Global** (Route 53 is a global service; the dropdown lists regions but they're disabled with the note "Route 53 doesn't require region selection"), and an account dropdown showing `demo-user @ 1234-5678-9012` with Account ID, Organization (mock), Billing and Cost Management (mock), and **Sign out**.

**Side navigation** (Cloudscape `SideNavigation`, header **Route 53** → `/route53/v2/home`). Use the real structure and labels:
```
Dashboard
Hosted zones
Health checks
Profiles
▸ IP-based routing
    CIDR collections
▸ Traffic flow
    Traffic policies
    Policy records
▸ Domains
    Registered domains
    Requests
▸ Resolver
    VPCs
    Inbound endpoints
    Outbound endpoints
    Rules
    Query logging
▸ DNS Firewall
    Rule groups
    Domain lists
──────────
▸ Application Recovery Controller   (external-link icon)
```
Only **Hosted zones** is fully implemented. Everything else goes to the `ComingSoon` component, which uses the normal page header, breadcrumbs, and a Container with `Box` text: "This feature is coming soon." The active link is highlighted based on the current pathname.

**Breadcrumbs** (`BreadcrumbGroup`): `Route 53 > Hosted zones > example.com > Create record`.

**Tools/Help panel** (`AppLayout tools` = `HelpPanel`): every page header has an **Info** link (`<Link variant="info">`) that opens context help in the right drawer. Write short help content for: Hosted zones, Create hosted zone, Records, Create record, Record types, TTL, Routing policy.

**Notifications** (`Flashbar` in the AppLayout `notifications` slot, in a global context provider): messages are dismissible and stack. Success is green, error red, in-progress blue with a spinner. Use the real wording, for example:
- After creating a zone: **"example.com was successfully created."** with the follow-up "Now you can create records in the hosted zone to specify how you want Route 53 to route traffic for your domain." and a **View details** button.
- After creating records: **"Record for example.com was successfully created."** Also show a short in-progress flash, "Change status: PENDING → INSYNC", to imitate how Route 53 propagates changes (mock it with about a 2s delay).
- Errors come from the API error `message`, e.g. "The resource record set already exists." or "The specified hosted zone contains non-required resource record sets and so cannot be deleted."

**Footer** (light grey bar): `CloudShell` · `Feedback` on the left; on the right `© 2026, Amazon Web Services, Inc. or its affiliates.` `Privacy` `Terms` `Cookie preferences`.

### 3.2 Login (mock)
Copy the AWS sign-in page: a centred card with the AWS logo and **Sign in**, radio tiles for **Root user** / **IAM user**, and an email field (pre-filled hint `demo@example.com`). **Next** moves to the password step (password `demo`, seeded). There's a "Sign in" button and links for "Forgot password?" and "Create a new AWS account" (both mocks). Put a promo panel on the right like the real page. After login, redirect to `/route53/v2/hostedzones` (or to `?next=`).

### 3.3 Hosted zones list (`/route53/v2/hostedzones`)
This follows the Cloudscape **table view** pattern.
- Header: **Hosted zones** with a counter `(N)` and an **Info** link. Actions on the right: ⟳ refresh icon button, **View details**, **Edit**, **Delete** (these three are disabled until a zone is selected), and the primary button **Create hosted zone**.
- Table: `selectionType="single"` (radio), sticky header, `resizableColumns`, sortable columns, `variant="full-page"`.
- Columns, in the real order: **Hosted zone name** (link to detail) · **Type** (`Public` / `Private`) · **Created by** (`Route 53`) · **Record count** · **Description** · **Hosted zone ID** (e.g. `Z04517273QG6BHBTB4S1N`).
- Filter: `PropertyFilter` with placeholder **"Filter hosted zones by property or value"**. Filterable properties: Hosted zone name, Type, Created by, Description, Hosted zone ID, with operators `=`, `!=`, `:` (contains), `!:`. Free text matches any column. Show "N matches" and a **Clear filters** action.
- Pagination: `Pagination` top-right, page size taken from preferences.
- Preferences (gear icon): `CollectionPreferences` with page size (10 / 25 / 50 / 100), wrap lines, striped rows, content density (comfortable/compact), column visibility and ordering. Persist these in localStorage.
- Empty state: "No hosted zones" / "You don't have any hosted zones." with a **Create hosted zone** button. No-match state: "No matches" with **Clear filter**.
- Loading state: `loading` with `loadingText="Loading hosted zones"`.

### 3.4 Create hosted zone (`/hostedzones/create`)
This follows the Cloudscape **create resource** pattern (`Form` + `Container`s).
- Header: **Create hosted zone** with Info. The description reads: "A hosted zone is a container that holds information about how you want to route traffic for a domain, such as example.com, and its subdomains."
- Container **Hosted zone configuration**:
  - **Domain name**, with the description "This is the name of the domain that you want to route traffic for." Placeholder `example.com`. Validate: max 253 chars, labels of 1 to 63 chars, allowed chars `a-z 0-9 - _ .`; a trailing dot is optional and gets normalised.
  - **Description - optional**, with the description "This value lets you distinguish hosted zones that have the same name." Textarea, max 256 chars, with a character counter.
  - **Type**: `Tiles` with two options. **Public hosted zone** ("A public hosted zone determines how traffic is routed on the internet.") and **Private hosted zone** ("A private hosted zone determines how traffic is routed within an Amazon VPC.").
  - If Private is chosen, show a container **VPCs to associate with the hosted zone**. Each row has a Region `Select` and a VPC ID `Select` (mock VPC list such as `vpc-0a1b2c3d (default)`), with **Add VPC** and **Remove** buttons. At least one VPC is required.
- Container **Tags** (`TagEditor`): "Apply tags to hosted zones to help organize and identify them." Up to 50 tags.
- Footer buttons: **Cancel** (link) and **Create hosted zone** (primary, shows a loading state while saving).
- On success, navigate to the zone detail page and show the success flashbar. Duplicate names are allowed (Route 53 allows them), but warn about it with an info Alert.

### 3.5 Hosted zone detail (`/hostedzones/[zoneId]`)
This follows the Cloudscape **resource details** pattern.
- Header `h1`: zone name, e.g. `example.com`, with Info. Actions: **Delete zone**, **Test record** (opens a mock modal), **Configure query logging** (mock).
- `ExpandableSection variant="container"` titled **Hosted zone details**, with an **Edit hosted zone** button in its header. Inside is a `KeyValuePairs` / `ColumnLayout` with 3 columns: Hosted zone name · Hosted zone ID · Description · Query log (`-`) · Type (`Public hosted zone`) · Record count · Name servers (4 values, each with a copy-to-clipboard button) · Created by (`Route 53`) · and for private zones, the associated VPCs.
- `Tabs`: **Records (N)** · **DNSSEC signing** (mock: status "Not signing", **Enable DNSSEC signing** button disabled) · **Hosted zone tags (N)** (table plus **Manage tags**) · **Accelerated recovery** (mock).

**Records tab table:**
- Header **Records (N)** + Info. Actions: ⟳ refresh, **Delete record** (enabled when ≥1 row is selected), **Import zone file**, **Export** dropdown (JSON / BIND, a bonus), and the primary **Create record**.
- `selectionType="multi"` (checkboxes; this covers bulk delete).
- Filters row: `PropertyFilter` with placeholder **"Filter records by property or value"**, plus 3 `Select` dropdowns next to it like the real console: **Type** (any / A / AAAA / …), **Routing policy** (any / Simple / Weighted / …), **Alias** (any / Yes / No).
- Columns: **Record name** · **Type** · **Routing policy** · **Differentiator** · **Alias** · **Value/Route traffic to** (multi-line, one value per line) · **TTL (seconds)** · **Health check ID** · **Evaluate target health** · **Record ID**. Use `-` for empty cells.
- Record names are shown fully qualified with no trailing dot (`www.example.com`). The apex record shows the zone name.
- Clicking a row (or selecting exactly one) opens the **SplitPanel** at the bottom/side titled **Record details**. It shows Record name, Record type, Value, Alias, TTL, Routing policy, and has an **Edit record** button. This is how the real console works, so it's important.
- Pagination + CollectionPreferences, same as the zones table.
- The default **NS** and **SOA** records can't be deleted. If they're selected, Delete is disabled, with a tooltip/alert: "You can't delete the NS and SOA records that Route 53 created for the hosted zone." NS can be edited; SOA can be edited, but only its values.

### 3.6 Create record (`/hostedzones/[zoneId]/records/create`)
Copy the real **"Quick create record"** view:
- Header **Quick create record** + Info, with a **Switch to wizard** link on the right. The wizard can be a mocked `Wizard` with the steps Choose routing policy → Configure records → Review and create. Implementing it is optional; quick create is required.
- One `Container` per record row (the **Record 1** header has a **Delete** button once there's more than one row). Fields, laid out in a grid like the real form:
  - **Record name**: an Input for the subdomain with the zone suffix `.example.com` shown inline to its right. Description: "Keep blank to create a record for the root domain." Supports `*` wildcards.
  - **Record type**: a `Select` whose options show code + description, exactly as in the console:
    - `A – Routes traffic to an IPv4 address and some AWS resources`
    - `AAAA – Routes traffic to an IPv6 address and some AWS resources`
    - `CAA – Restricts CAs that can create SSL/TLS certifications for the domain`
    - `CNAME – Routes traffic to another domain name and to some AWS resources`
    - `DS – Delegation signer, used to establish a chain of trust for DNSSEC` (optional)
    - `MX – Specifies mail servers`
    - `NAPTR – Is used by DDDS applications` (optional)
    - `NS – Name servers for a hosted zone`
    - `PTR – Maps an IP address to a domain name`
    - `SPF – Not recommended` (optional)
    - `SRV – Application-specific values that identify servers`
    - `TXT – Used to verify email senders and for application-specific values`
  - **Alias** `Toggle`. When it's on, replace Value/TTL with **Route traffic to**: an endpoint-type `Select` (Alias to API Gateway, CloudFront distribution, Elastic Beanstalk, ELB (Application/Classic/Network), S3 website endpoint, VPC endpoint, another record in this hosted zone…), a mock Region select, a target input, and **Evaluate target health** Yes/No. Alias is only allowed for A/AAAA/CNAME (and others per the docs), and Alias records have no TTL.
  - **Value**: a `Textarea` with the description "Enter multiple values on separate lines." The placeholder changes with the type (see §3.8).
  - **TTL (seconds)**: a numeric Input with the quick buttons **1m**, **1h**, **1d** next to it. Description "Recommended values: 60 to 172800 (two days)". Default 300.
  - **Routing policy**: a `Select` with Simple routing, Weighted, Geolocation, Latency, Failover, Multivalue answer, IP-based, Geoproximity. Non-simple policies show extra fields: **Weight** (0-255), **Region**, **Location**, **Failover record type** (Primary/Secondary), **Health check - optional**, and the **Record ID** (set identifier, required for non-simple). Store all of these; they don't change any behaviour.
- Below the rows: an **Add another record** button (normal variant).
- Form footer: **Cancel** and **Create records** (primary). All rows are submitted in one request to the change batch endpoint, so either everything is created or nothing is. Errors are mapped back onto the row/field that caused them.

### 3.7 Edit record / Edit hosted zone / Deletes
- **Edit record** page: the same row form for a single record. Header **Edit record**. Record name and Type are **read-only** (Route 53 doesn't let you rename; the user deletes and recreates instead). Buttons: **Cancel**, **Save**. It sends an `UPSERT`.
- **Edit hosted zone** page: only **Description** (and tags) can be edited, which matches `UpdateHostedZoneComment`. The domain name and type are shown disabled. Buttons: **Cancel**, **Save changes**.
- **Delete hosted zone** modal (Cloudscape "delete with additional confirmation" pattern): title **Delete hosted zone?**, body "Deleting a hosted zone is permanent…" with the zone name in bold, a text field labelled 'To confirm deletion, type "delete" in the field.', and **Cancel** / **Delete** (Delete stays disabled until the input equals `delete`). If the zone still has records other than the default NS/SOA, show a red `Alert`: "Before you delete a hosted zone, you must delete all records except the default NS and SOA records." Keep Delete disabled in that case.
- **Delete records** modal: title **Delete records?**, a small read-only table listing the selected records (Name, Type, Value), and **Cancel** / **Delete**. Uses one `DELETE` change batch.

### 3.8 Per-type value validation (same rules client-side and server-side)

| Type | Value format | Placeholder / example |
|---|---|---|
| A | IPv4, one per line | `192.0.2.235` |
| AAAA | IPv6, one per line | `2001:0db8:85a3:0:0:8a2e:0370:7334` |
| CNAME | **Exactly one** domain name; not allowed at the zone apex; can't coexist with other types at the same name | `www.example.com` |
| TXT | One or more strings in double quotes, each ≤255 chars (longer values are split into multiple quoted strings), total ≤4000 | `"v=spf1 include:_spf.example.com ~all"` |
| MX | `priority mailserver`, priority 0-65535 | `10 mail.example.com` |
| NS | domain names | `ns-1.awsdns-01.org` |
| PTR | domain name | `hostname.example.com` |
| SRV | `priority weight port target`, each 0-65535 | `1 10 5269 xmpp-server.example.com` |
| CAA | `flags tag "value"`, flags 0-255, tag ∈ issue / issuewild / iodef / issuemail / issuevmc | `0 issue "amazon.com"` |
| SOA | 7 fields: `mname rname serial refresh retry expire minimum` (edit only) | `ns-2048.awsdns-64.net. hostmaster.example.com. 1 7200 900 1209600 86400` |

Also enforce: TTL 0–2147483647; (name, type, set_identifier) must be unique within the zone; record names must be inside the zone; no CNAME together with other data at the same name.

---

## 4. Domain rules to replicate

1. **Zone ID format**: `Z` + 20 random uppercase alphanumeric characters (e.g. `Z0812345ABCDEFGHIJKLM`). Change IDs look like `C` + 20 characters.
2. **Auto-created records** when a zone is created:
   - `NS` at the apex, TTL **172800**, with 4 delegation-set nameservers chosen deterministically from the zone ID: `ns-{n}.awsdns-{nn}.com.`, `.net.`, `.org.`, `.co.uk.`.
   - `SOA` at the apex, TTL **900**: `ns-{n}.awsdns-{nn}.com. awsdns-hostmaster.amazon.com. 1 7200 900 1209600 86400`.
   - Both get the flag `is_default=True` and can't be deleted.
3. **Record count** = the number of record sets, including NS and SOA (a new zone shows **2**). Keep it as a denormalised column, updated in the same transaction.
4. **Deleting a zone** fails with HTTP 400 `HostedZoneNotEmpty` unless only the default NS/SOA remain.
5. **Change batches are atomic**: either all changes apply or none do. A `CREATE` of an existing set → `InvalidChangeBatch: ... already exists`. A `DELETE` of a missing set → `InvalidChangeBatch: ... not found`. `UPSERT` creates or replaces.
6. Names are stored **lower-cased and fully qualified with a trailing dot** (`www.example.com.`). The UI strips the trailing dot when displaying. Escape `*` as `\052` the way AWS does in API output, but show `*` in the UI.
7. Each successful change creates a `changes` row with `status=PENDING`, which becomes `INSYNC` after about 2s (computed on read: `INSYNC if now - submitted_at > 2s`).

---

## 5. Database schema (SQLite)

```sql
PRAGMA foreign_keys = ON;  PRAGMA journal_mode = WAL;

CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  display_name  TEXT NOT NULL,
  account_id    TEXT NOT NULL,           -- mock 12-digit AWS account id
  password_hash TEXT NOT NULL,           -- bcrypt, even though mocked
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  token       TEXT PRIMARY KEY,          -- secrets.token_urlsafe(32), stored hashed (sha256)
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at  TEXT NOT NULL
);

CREATE TABLE hosted_zones (
  id               TEXT PRIMARY KEY,     -- 'Z0812345ABCDEFGHIJKLM'
  owner_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,        -- 'example.com.' (lowercase, trailing dot)
  comment          TEXT,                 -- "Description"
  is_private       INTEGER NOT NULL DEFAULT 0,
  caller_reference TEXT NOT NULL,
  record_count     INTEGER NOT NULL DEFAULT 0,
  name_servers     TEXT NOT NULL,        -- JSON array of 4 NS hostnames
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (owner_id, caller_reference)
);
CREATE INDEX ix_zones_owner_name ON hosted_zones(owner_id, name);

CREATE TABLE zone_vpcs (                 -- private zone associations
  id        INTEGER PRIMARY KEY,
  zone_id   TEXT NOT NULL REFERENCES hosted_zones(id) ON DELETE CASCADE,
  vpc_id    TEXT NOT NULL,
  vpc_region TEXT NOT NULL,
  UNIQUE (zone_id, vpc_id, vpc_region)
);

CREATE TABLE zone_tags (
  zone_id TEXT NOT NULL REFERENCES hosted_zones(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (zone_id, key)
);

CREATE TABLE record_sets (
  id               INTEGER PRIMARY KEY,
  zone_id          TEXT NOT NULL REFERENCES hosted_zones(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,        -- 'www.example.com.'
  type             TEXT NOT NULL CHECK (type IN ('A','AAAA','CAA','CNAME','DS','MX','NAPTR','NS','PTR','SOA','SPF','SRV','TXT')),
  ttl              INTEGER,              -- NULL for alias records
  set_identifier   TEXT,                 -- "Record ID" for non-simple routing
  routing_policy   TEXT NOT NULL DEFAULT 'SIMPLE',  -- SIMPLE|WEIGHTED|LATENCY|FAILOVER|GEOLOCATION|MULTIVALUE|IP_BASED|GEOPROXIMITY
  weight           INTEGER,
  region           TEXT,
  failover         TEXT,                 -- PRIMARY|SECONDARY
  geo_location     TEXT,                 -- JSON {continent, country, subdivision}
  multivalue       INTEGER,
  health_check_id  TEXT,
  alias_target     TEXT,                 -- JSON {hosted_zone_id, dns_name, evaluate_target_health} or NULL
  is_default       INTEGER NOT NULL DEFAULT 0,  -- auto NS/SOA, undeletable
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- SQLite treats NULLs as distinct in UNIQUE, so use COALESCE in an expression index:
CREATE UNIQUE INDEX ux_record_identity ON record_sets(zone_id, name, type, COALESCE(set_identifier, ''));
CREATE INDEX ix_records_zone_type ON record_sets(zone_id, type);

CREATE TABLE resource_records (          -- one row per value line
  id            INTEGER PRIMARY KEY,
  record_set_id INTEGER NOT NULL REFERENCES record_sets(id) ON DELETE CASCADE,
  value         TEXT NOT NULL,
  position      INTEGER NOT NULL         -- preserves user ordering
);

CREATE TABLE changes (
  id           TEXT PRIMARY KEY,         -- 'C2682N5HXP0BZ4'
  zone_id      TEXT REFERENCES hosted_zones(id) ON DELETE SET NULL,
  comment      TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload      TEXT NOT NULL             -- JSON of the change batch (audit trail)
);
```
Include an ER diagram (Mermaid) in the README: `users 1─* sessions`, `users 1─* hosted_zones`, `hosted_zones 1─* record_sets 1─* resource_records`, `hosted_zones 1─* zone_tags / zone_vpcs / changes`.

---

## 6. API design (FastAPI, prefix `/api/v1`)

Errors follow the Route 53 style: `{"error": {"code": "InvalidChangeBatch", "message": "...", "field": "changes[0].values[1]"}}` with the right HTTP status (400/401/404/409/422).

**Auth**
| Method | Path | Notes |
|---|---|---|
| POST | `/auth/login` | `{email, password}` → sets the `r53_session` httpOnly, SameSite=Lax cookie (`Secure` only when `SESSION_COOKIE_SECURE=true`; false locally); returns the user |
| POST | `/auth/logout` | deletes the session row and clears the cookie |
| GET | `/auth/me` | current user, or 401 |

**Hosted zones**
| Method | Path | Notes |
|---|---|---|
| GET | `/hostedzones?search=&type=&sort=name&order=asc&page=1&page_size=50` | Returns `{items, total, page, page_size}`. The client also handles filtering via collection-hooks, but the server supports it too. |
| POST | `/hostedzones` | `{name, comment?, private_zone, vpcs?, tags?}` → 201 with the zone + `change_info` + `delegation_set` (also auto-creates NS/SOA) |
| GET | `/hostedzones/{id}` | zone + name servers + vpcs + tags |
| PATCH | `/hostedzones/{id}` | `{comment?}` (like UpdateHostedZoneComment) |
| PUT | `/hostedzones/{id}/tags` | replaces all tags |
| DELETE | `/hostedzones/{id}` | 400 `HostedZoneNotEmpty` if non-default records exist |

**Records**
| Method | Path | Notes |
|---|---|---|
| GET | `/hostedzones/{id}/recordsets?search=&type=&routing_policy=&alias=&page=&page_size=` | list |
| GET | `/hostedzones/{id}/recordsets/{rid}` | single |
| POST | `/hostedzones/{id}/rrset` | **ChangeResourceRecordSets**: `{comment?, changes:[{action:"CREATE"\|"UPSERT"\|"DELETE", record_set:{name,type,ttl,values[],routing_policy,set_identifier?,weight?,alias_target?…}}]}`. Atomic, returns `change_info`. Create, edit, and bulk delete in the UI all go through this. |
| DELETE | `/hostedzones/{id}/recordsets/{rid}` | convenience single delete |
| GET | `/changes/{change_id}` | `{id, status: PENDING\|INSYNC, submitted_at}` |

**Import / export (bonus)**
| Method | Path | Notes |
|---|---|---|
| POST | `/hostedzones/{id}/import` | body `{zone_file: string}`. Parsed with `dns.zone.from_text(origin=zone.name, relativize=False)`. SOA and apex NS are skipped (as AWS does). Returns a preview when `?dry_run=true`, and otherwise applies everything as one CREATE batch. |
| GET | `/hostedzones/{id}/export?format=json\|bind` | JSON is `ListResourceRecordSets`-shaped; BIND is standard zone text with `$ORIGIN` / `$TTL` |

**Health**: `GET /api/health`.

Layering: routers do only HTTP work, `services/` hold the business rules (validation, the atomic change batch, record counts), and `models.py` holds persistence. Put all writes inside a single `with session.begin():`.

---

## 7. Frontend engineering notes

- `next.config.ts`:
  ```ts
  transpilePackages: ['@cloudscape-design/components', '@cloudscape-design/component-toolkit', '@cloudscape-design/collection-hooks'],
  async rewrites() { return [{ source: '/api/:path*', destination: `${process.env.BACKEND_URL}/api/:path*` }]; }
  ```
- Import `@cloudscape-design/global-styles/index.css` once in the root layout. Fonts: Cloudscape uses "Open Sans" / Amazon Ember fallbacks, so leave its defaults alone.
- Data fetching: SWR or TanStack Query, with typed `api.ts` wrappers. Invalidate and refetch after mutations. Use optimistic updates for deletes.
- Tables: use `useCollection` from `@cloudscape-design/collection-hooks` with `propertyFiltering`, `sorting`, `pagination`, `selection`. Lists of up to a few thousand items are fine client-side, and the server pagination params exist for bigger lists.
- Keep the URL in sync with filters (`?filter=`) so they survive reloads and can be shared.
- Forms: one `validators.ts` shared by all record types. Show errors through `FormField errorText`. On submit, scroll to the first error.
- `middleware.ts` (`proxy.ts` on Next.js 16+): redirect when `r53_session` is missing for `/route53/*`, and redirect `/` → `/route53/v2/hostedzones`.
- Dark mode: `applyMode(Mode.Dark | Mode.Light)` from `@cloudscape-design/global-styles`, saved in localStorage, and toggled from the top-nav settings menu.
- **Keyboard shortcuts** (bonus, shown in a modal opened with `?`): `Alt+S` focuses the top search, `/` focuses the table filter, `c` goes to Create (zone or record, depending on the page), `r` refreshes, `Del` deletes the selection, `Esc` closes the modal or split panel, `g z` goes to Hosted zones, `g d` to Dashboard. Ignore shortcuts while focus is in an input.
- Accessibility: Cloudscape takes care of most of it. Every action still needs a label.
- No `any`. Generate the TS types from the FastAPI OpenAPI schema (`openapi-typescript`) or write them by hand in `types.ts`.

---

## 8. Phased implementation (with acceptance checks)

### Phase 1: Scaffolding
- Create `backend/` (FastAPI, SQLAlchemy, pydantic-settings, uvicorn, dnspython, bcrypt, pytest, httpx; all free/OSS) and `frontend/` (`create-next-app --ts --app`, plus the Cloudscape packages and SWR).
- DB init + seed script: the demo user `demo@example.com` / `demo`, plus 3 zones (`example.com`, `mycompany.io`, private `internal.corp`) with about 15 assorted records covering every type, so the tables look full.
- ✅ `uvicorn app.main:app` serves `/docs`; `npm run dev` renders a Cloudscape button.

### Phase 2: Auth
- Login, logout, and `/me` endpoints, the session table, the `get_current_user` dependency, the login page UI, middleware, and the account dropdown with sign out.
- ✅ A protected page redirects to login; after login, a reload keeps you signed in; sign out clears the session; tests pass.

### Phase 3: Console shell
- TopNavigation, SideNavigation (the full tree from §3.1), breadcrumbs, the Flashbar provider, the HelpPanel provider, the footer, and the ComingSoon pages for every non-hosted-zone link.
- ✅ Every side-nav link routes somewhere; the active state is correct; the help drawer opens from Info links.

### Phase 4: Hosted zones CRUD
- Backend: zone services (ID generation, NS/SOA auto-creation, delete guard), routers, and tests.
- Frontend: the list (§3.3), create (§3.4), details header and expandable section (§3.5), edit, and the delete modal.
- ✅ Create → it appears with record count 2 and 4 name servers; search/filter/sort/paginate work; editing the description persists after a reload; deleting a non-empty zone is blocked with an error; deleting an empty zone works with the typed "delete" confirmation; a flashbar shows on every action.

### Phase 5: DNS records CRUD
- Backend: per-type validation (§3.8), the atomic change batch, and list filters. Tests cover every type plus the CNAME conflict, duplicate, and NS/SOA protection.
- Frontend: the records table with the 3 extra filter dropdowns, the split panel, the quick-create multi-row form, alias and routing-policy fields, edit, and the bulk-delete modal.
- ✅ Records of every listed type can be created with valid values; invalid values show inline errors that match the server's; adding 3 rows creates 3 records atomically; edit with UPSERT persists; bulk delete works; the record count updates.

### Phase 6: Polish for UI similarity
- Put the clone next to the real console (or screenshots of it) and fix differences in copy, button order, column order, empty states, and spacing.
- Add loading states, empty states, a 404 for unknown zone IDs ("Hosted zone not found"), and handling for network errors.

### Phase 7: Bonus
- BIND import modal (Textarea for pasting plus `FileUpload`, preview table, then **Import**), JSON/BIND export, dark mode, keyboard shortcuts. Bulk zone delete via multi-select is optional.

### Phase 8: Docs and tests
- README (§9), backend pytest coverage of at least 80% on services, and optionally a Playwright smoke test (login → create zone → create record → delete).
- Run the full local walkthrough from §10 on a fresh clone with a deleted `route53.db`.

---

## 9. README must contain
1. A project summary and screenshots (light + dark).
2. **Setup**: prerequisites (Node 20+, Python 3.11+); `cd backend && python -m venv .venv && pip install -r requirements.txt && python -m app.seed && uvicorn app.main:app --reload`; `cd frontend && npm i && cp .env.example .env.local && npm run dev`; demo credentials.
3. **Architecture overview**: a diagram (browser → Next.js (Cloudscape UI, rewrites) → FastAPI (routers → services → SQLAlchemy) → SQLite), and why Cloudscape was chosen.
4. **Database schema**: the tables from §5 plus a Mermaid ER diagram.
5. **API overview**: the tables from §6 plus a link to `/docs`.
6. Feature checklist, bonus features, keyboard shortcuts, known limitations (no real DNS resolution; routing policies are stored but not evaluated).
7. A "Demo" heading with the placeholder text "Hosted link coming soon" (filled in once it's deployed).

---

## 10. Local development (no deployment for now)

Everything runs locally. Hosting is deferred, and the assignment's "hosted demo link" will be handled in a later step.

| Piece | Local setup |
|---|---|
| Backend | `uvicorn app.main:app --reload --port 8000`, API at `http://localhost:8000/api/v1`, docs at `http://localhost:8000/docs` |
| Frontend | `npm run dev` on `http://localhost:3000`; `.env.local` has `BACKEND_URL=http://localhost:8000` (used by the `/api` rewrite) |
| Database | SQLite file `backend/route53.db` (`DATABASE_URL=sqlite:///./route53.db`), created automatically on startup and git-ignored |
| Seed / reset | `python -m app.seed` loads the demo user and sample zones; `python -m app.seed --reset` drops and recreates the data |
| Tests | `pytest` uses a temporary SQLite DB, never `route53.db` |

Other steps:
- Commit `.env.example` files for both apps. Never commit `.env` / `.env.local`.
- Optional: a root `dev` script (e.g. `npm-run-all` or a `dev.ps1`) that starts both servers at once.
- Local walkthrough to verify before calling it done: sign in → create a public zone → it shows 2 records → add an A, AAAA, CNAME, TXT, MX, NS, PTR, SRV and CAA record → edit one → bulk-delete them → delete the zone → sign out → sign in again; the data is still there after restarting the backend.

---

## 11. Definition of done
- [ ] Every assignment scope item works and persists in SQLite after a server restart.
- [ ] Every page uses Cloudscape and matches the real console's layout, copy, and flows.
- [ ] Hosted zones: list, search, filter, paginate, create (public/private, tags), edit, delete (with guard).
- [ ] Records: all 9 required types, list, search, filters, split panel, multi-row create, edit, bulk delete, NS/SOA protection.
- [ ] Mocked sections show "Coming soon".
- [ ] Flashbar notifications for every mutation; modals for every delete.
- [ ] Auth: login, logout, session persists across reloads.
- [ ] Bonus: import, export, dark mode, shortcuts, bulk ops.
- [ ] README complete; tests green; the local walkthrough in §10 passes on a fresh clone.
- [ ] Total cost is $0: only open-source dependencies, no paid APIs or services.
