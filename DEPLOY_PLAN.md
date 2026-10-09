# Deployment Plan: Route 53 Clone (free hosting)

**Goal:** get a public HTTPS URL for the app, at $0, so it can be submitted as the assignment's "hosted working link".
**Repo:** https://github.com/devasyakanwar/route53_clone (branch `main`, already pushed)
**Primary plan:** Render (free), via the `render.yaml` blueprint already in the repo root.
**Fallback plan:** Vercel (frontend) + Render (API). See section 7.

## 0. Rules for you (the deploying agent)

- **Everything must be free.** Choose the free instance type for every service. If any step asks for a credit card, a
  paid plan, or a paid add-on, **stop and ask the user**; do not enter payment details.
- Do not change application code unless a step below says to. If you think a code change is needed, explain why and ask.
- Never commit secrets. There are none to add: this app has no API keys. All config is in non-secret env vars.
- Account actions (signing in to Render/Vercel/GitHub, authorising the GitHub app) must be done by the user. Ask them to
  do those steps, or have them hand you a logged-in browser session. Do not ask for their passwords or tokens.
- Report outcomes honestly: if a verification step fails, say so with the output.

## 1. What is being deployed (read this first)

Two services that talk over HTTP; the browser only ever talks to the first one.

```
Browser ──HTTPS──▶ Web service  (Next.js 16, Node, folder frontend/)
                      │  rewrites /api/*  →  ${BACKEND_URL}/api/*
                      ▼
                   API service  (FastAPI + SQLite, Python, folder backend/)
```

| | Web (frontend) | API (backend) |
|---|---|---|
| Folder | `frontend/` | `backend/` |
| Runtime | Node 20.9+ (blueprint pins 22.12.0) | Python 3.11+ (blueprint pins 3.12.7) |
| Build | `npm ci && npm run build` | `pip install -r requirements.txt` |
| Start | `npm run start` (Next reads `$PORT`) | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
| Health check | `/login` returns 200 | `/api/health` returns `{"status":"ok"}` |

Why it works with no CORS setup: the Next.js `rewrites` in `frontend/next.config.ts` proxy `/api/*` to the API, so the
browser sees one origin and the session cookie is first-party. **`BACKEND_URL` is read when the frontend is built**
(rewrites are baked into the build output), so it must be set **before the first build**, or the frontend must be
rebuilt after changing it.

Database: SQLite file `backend/route53.db`, created automatically on first start and seeded with demo data when empty
(`AUTO_SEED=true`). Demo login: `demo@example.com` / `demo`.

## 2. Environment variables

**API service**

| Variable | Value | Notes |
|---|---|---|
| `PYTHON_VERSION` | `3.12.7` | already in `render.yaml` |
| `DATABASE_URL` | `sqlite:///./route53.db` | default; keep |
| `SESSION_COOKIE_SECURE` | `true` | cookie is only sent over HTTPS (the public site is HTTPS) |
| `AUTO_SEED` | `true` | seeds demo user, 3 zones, 4 health checks on an empty DB |
| `CORS_ORIGINS` | *(leave empty)* | not needed, requests are same-origin via the proxy |

**Web service**

| Variable | Value | Notes |
|---|---|---|
| `NODE_VERSION` | `22.12.0` | already in `render.yaml` |
| `BACKEND_URL` | `https://<api-service>.onrender.com` | **no trailing slash**; must be the API's public URL |

## 3. Primary plan: Render Blueprint (free)

1. **User action:** sign in at https://render.com (GitHub login is simplest) and let Render access the repo
   `devasyakanwar/route53_clone`.
2. In the Render dashboard: **New → Blueprint** → select the repo → branch `main`. Render reads `render.yaml` and
   proposes two services: `route53-clone-api` and `route53-clone-web`. Confirm both show **plan: Free**.
3. Render asks for the one unset variable, `BACKEND_URL` (it is marked `sync: false`). The API's URL is not known until
   it exists. Use this order:
   - If the form requires a value now, enter the expected URL `https://route53-clone-api.onrender.com`.
   - If that name was taken, Render appends a suffix. After the API is created, copy its real URL from the API service
     page, set `BACKEND_URL` on `route53-clone-web` to it, and **trigger a manual deploy** of the web service (rebuild
     is required, see section 1).
4. Wait for both deploys to finish (API first, about 2 to 4 min; web about 3 to 6 min).
5. Run the verification in section 5. Then do section 6.

If the blueprint flow is unavailable, create the two services manually with **New → Web Service**, free instance
type, using the folders, build/start commands and env vars from sections 1 and 2 (set **Root Directory** to `backend`
and `frontend` respectively, and Health Check Path to `/api/health` for the API).

## 4. Known free-tier behaviour (tell the user, do not "fix")

- **Cold starts:** free web services sleep after about 15 minutes idle. The first request wakes them and takes roughly
  30 to 60 s. The web service may show an error page or a slow load, and the first `/api` call can fail while the API is
  still waking. **A reload after a minute fixes it.** Before a demo, open the API URL `/api/health` first, wait for
  `ok`, then open the web URL.
- **Data resets:** free instances have an ephemeral disk, so SQLite is recreated and re-seeded on every restart,
  redeploy and wake-up after a spin-down that replaces the instance. Data created in the UI may disappear. This is
  acceptable for the assignment ("a hosted working link"); the demo data comes back automatically.
- **Do not keep both services awake with a pinger.** Free accounts have a monthly instance-hour allowance (about 750
  hours as of my knowledge, verify on Render's pricing page); two always-on services would exceed it. Just wake them
  before a demo.
- Do not add a persistent disk or Postgres: those are paid on Render. If durable data is ever required, that is a
  separate decision for the user (options: a free Postgres elsewhere such as Neon or Supabase; only `DATABASE_URL`
  and the `psycopg` driver would change).

## 5. Verification checklist (run all, report results)

Replace the two hostnames with the real ones. `curl` shows status codes; allow up to 90 s for the first request.

```bash
API=https://<api-service>.onrender.com
WEB=https://<web-service>.onrender.com

# 1. API is up
curl -s $API/api/health                                   # {"status":"ok"}

# 2. Web is up and the root redirects to login when signed out
curl -s -o /dev/null -w '%{http_code}\n' $WEB/login        # 200
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' $WEB/   # 307 -> $WEB/login

# 3. The proxy reaches the API (this is what BACKEND_URL controls)
curl -s $WEB/api/health                                    # {"status":"ok"}

# 4. Login through the web origin works and returns a Secure httpOnly cookie
curl -s -i -c /tmp/cj -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"demo"}' $WEB/api/v1/auth/login | grep -iE "^HTTP|set-cookie"
#    expect HTTP 200 and a cookie r53_session with HttpOnly; Secure; SameSite=lax

# 5. Authenticated data (seeded): 3 zones, 4 health checks
curl -s -b /tmp/cj $WEB/api/v1/dashboard
#    expect hosted_zones 3, record_sets 28, health_checks 4

# 6. Signed-in root goes to the Dashboard
curl -s -b /tmp/cj -o /dev/null -w '%{http_code} %{redirect_url}\n' $WEB/    # 307 -> $WEB/route53/v2/home
```

Then a browser check (ask the user to do it, or use a browser tool if you have one):
1. Open `$WEB`, sign in with `demo@example.com` / `demo` → lands on the **Dashboard**.
2. Hosted zones lists 3 zones; open `example.com` → records table loads.
3. Create a hosted zone, create an A record, delete both. Reload the page: still signed in.
4. Account menu (top right) → Visual mode → Dark; page turns dark and stays dark after reload.

**Common failures and fixes**

| Symptom | Cause | Fix |
|---|---|---|
| `$WEB/api/health` returns 500/502/404 | `BACKEND_URL` wrong, has a trailing slash, was empty at build time, or API is asleep | Fix the variable, redeploy the web service (rebuild). If asleep, wait 60 s and retry |
| Login returns 200 but you are bounced back to `/login` | Cookie not stored: `SESSION_COOKIE_SECURE=true` but the site was opened over plain `http://` | Always use the `https://` URL |
| Web build fails on `npm ci` | Lockfile out of sync | Run `npm install` in `frontend/`, commit `package-lock.json`, push |
| API fails to start: `ModuleNotFoundError` | Wrong root directory | Root Directory must be `backend` |
| Pages load but data never appears | API asleep or crashed | Open `$API/api/health`; check the API service logs |

## 6. After it works: record the link

1. In `README.md`, replace the `## Demo` text "Hosted link coming soon…" with the real URL and the demo credentials
   (`demo@example.com` / `demo`), plus one line about the cold start and data reset (section 4).
2. Commit with a message like `Add hosted demo link`, end the message with the attribution line your instructions
   require, and push to `main`. Render auto-deploys on push (this README-only change does not need a rebuild check).
3. Give the user: the web URL, the API URL, the demo credentials, and the results of section 5.

## 7. Fallback plan: Vercel (frontend) + Render (API)

Use this only if Render's frontend service is the problem (for example build memory limits on the free tier).

1. Deploy only the API on Render (as in section 3, but create only `route53-clone-api`; if using the blueprint, delete
   the web service from it).
2. **User action:** sign in at https://vercel.com with GitHub. **Add New → Project** → import `route53_clone`.
3. Set **Root Directory** to `frontend`. Framework preset: Next.js (auto-detected). Leave build/output defaults.
4. Add env var `BACKEND_URL` = the Render API URL (no trailing slash) **before** the first deploy (Hobby plan is free).
5. Deploy, then run the section 5 checks against the Vercel URL as `$WEB`.
6. The API's `SESSION_COOKIE_SECURE` stays `true`. No CORS settings are needed because the browser only talks to Vercel,
   which proxies `/api/*` to Render.

## 8. Rollback and cleanup

- A bad deploy: in Render, open the service → **Events/Deploys** → redeploy a previous successful deploy.
- To remove everything: delete both services in the Render dashboard (the user's decision, never do it unprompted).

## 9. Reference: where things are in the repo

| Path | What it is |
|---|---|
| `render.yaml` | The blueprint used in section 3 |
| `frontend/next.config.ts` | The `/api` rewrite that uses `BACKEND_URL` |
| `frontend/src/proxy.ts` | Redirects signed-out users to `/login`; `/` goes to the Dashboard |
| `backend/app/main.py` | FastAPI app; creates tables and seeds on startup |
| `backend/app/config.py` | All settings and their defaults (env vars in section 2) |
| `backend/.env.example` | Example local settings |
| `README.md` | Setup, architecture, API overview (has the `## Demo` section to update) |
