# Deploying Supertitle (Hetzner + Coolify)

Production runs on **one Hetzner server managed by Coolify** (e.g. a CX33: 4 vCPU, 8 GB) with two resources from this repo — the **web app** and the **worker** — plus a **Postgres** database in Coolify and **Cloudflare R2** (files). Do the steps in order.

| Piece | Where | Image |
|---|---|---|
| Web app (Next.js) | Coolify on the server, behind its Traefik (HTTPS) | `apps/web/Dockerfile` |
| Worker (FFmpeg, Chromium, transcription) | Coolify on the same server, no public port | `apps/worker/Dockerfile` |
| Database | Coolify on the same server, no public port | `postgres:17-alpine` |
| Files and database backups | Cloudflare R2 | — |

Why not a serverless Postgres such as Neon: the worker polls the job queue every second and the health check queries the database every 30 s, so the database never idles. A scale-to-zero plan bills that as an always-on compute; the free tier runs out of compute hours mid-month and then refuses every query.

## 1. Domain
Create an **A record** for the domain (and `www` if you want it) pointing at the server's IP. If DNS is on Cloudflare, leave the proxy **off** (grey cloud) at first, so Coolify can issue the certificate.

## 2. Database (Postgres in Coolify)
- New resource → Databases → **PostgreSQL 17**, on the same server as the app. Its own instance, not a database inside another project's Postgres: separate backups, upgrades and restarts.
- Initial database `fala`, a generated password. Leave **Make it publicly available** off.
- Resource limits: **1 CPU, 1 GB** memory.
- Copy **Postgres URL (internal)** → both `DATABASE_URL` and `DIRECT_DATABASE_URL` (web), and `DATABASE_URL` (worker). There's no pooler in between, so the two are the same URL, and no `sslmode` (the traffic stays on Docker's internal network).
- **Backups** are on you now:
  - R2: a private bucket just for backups (e.g. `fala-backups`) and an API token limited to it.
  - Coolify → S3 Storages → add it (endpoint `https://<account-id>.r2.cloudflarestorage.com`, region `auto`).
  - The database → Backups → a scheduled backup, daily (`0 3 * * *`), **Save to S3** on, keep e.g. 14 in S3 and 2 locally.
  - Restore one into a scratch database once, so you know the backups work before you need them.

### Moving the data off Neon (one-off)
1. Neon must be able to answer queries: if its free plan ran out of compute, upgrade it for the move (you can delete the project afterwards).
2. Create the Postgres above and copy its internal URL.
3. Coolify → **stop** the worker and the web app, so nothing writes to Neon during the copy.
4. On the server, with this repo's `deploy/migrate-from-neon.sh`:
   ```sh
   export SOURCE_URL='<Neon direct URL, the host without -pooler>'
   export TARGET_URL='<Postgres URL (internal) from Coolify>'
   sh migrate-from-neon.sh
   ```
   It refuses a target that already has tables, dumps Neon to a file in the current directory, restores it and compares every table's row count. If the network isn't called `coolify` (`docker network ls`), set `NETWORK=…`.
5. Change `DATABASE_URL` / `DIRECT_DATABASE_URL` in the web app and `DATABASE_URL` in the worker to the internal URL; deploy both. The web log should say "No pending migrations to apply" (the migration history came with the data).
6. Check `/api/health`, sign in, and that the deep health check sees the worker. Keep the Neon project and the dump file for a few days, then delete them.

## 3. Storage (Cloudflare R2)
- A private bucket (e.g. `fala`) and an API token with read/write on it.
- **CORS:** allow `GET` and `PUT` from `https://usesupertitle.com`, header `Content-Type`.
- **Lifecycle:** abort incomplete multipart uploads after 1 day.
- `R2_ENDPOINT` is `https://<account-id>.r2.cloudflarestorage.com`.

## 4. Web app in Coolify
New resource → the GitHub repo (`main`) → build pack **Dockerfile**:
- Base directory `/`, Dockerfile location `apps/web/Dockerfile`, port **3000**.
- Domain: `https://usesupertitle.com` (Coolify/Traefik issues the certificate).
- Health check: leave Coolify's own **disabled**. It probes with curl/wget, which the slim image doesn't have, so it would mark the app unhealthy; the Dockerfile's `HEALTHCHECK` (node fetching `/api/health`) already covers it.
- **Migrations** need no Coolify setting: the container applies pending ones on start (`apps/web/docker-entrypoint.sh`), before the server answers, so it never turns healthy if they fail. Leave the **Pre-deployment command empty**: Coolify runs it with `docker exec` in the container *already running* — the previous release, with its old environment and old migrations.
- **Environment variables** — everything in the root `.env.example`, with production values:
  - `NODE_ENV=production`, `BETTER_AUTH_URL` and `APP_URL` = `https://usesupertitle.com`, a new `BETTER_AUTH_SECRET` (`openssl rand -base64 32`);
  - `DATABASE_URL`, `DIRECT_DATABASE_URL`, `R2_*`;
  - `PADDLE_ENV=production` and the production Paddle keys and prices (step 7). Until Paddle approves the live account, use `PADDLE_ENV=sandbox` with the sandbox keys and prices (the log warns `billing.paddle_sandbox` at startup);
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, `HEALTH_TOKEN`;
  - the client IP for the sign-in rate limit: nothing with Traefik alone (it sends a single `X-Forwarded-For`). With the Cloudflare proxy on (orange cloud), set `AUTH_IP_HEADER=cf-connecting-ip`, and only then: that header is safe only when the server accepts web traffic from Cloudflare's IPs alone (Hetzner firewall). For a longer proxy chain, list the proxies in `AUTH_TRUSTED_PROXIES` (comma-separated CIDRs).
    After the first deploy, sign in once and search the web log for `could not determine a client IP`: if it's there, every visitor shares one rate-limit bucket and a few bad attempts lock everyone out — fix the setting above.
  - Mark **`NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`, `R2_ENDPOINT` and `APP_URL` as build variables**: they're baked in at build time (client bundle, security headers, sitemap). Changing them needs a rebuild, not just a restart.
- Resource limits (Advanced): **1 CPU, 1.5 GB** memory.

The app refuses to start while a production setting is missing or `apps/web/lib/legal.ts` still has placeholders; the deployment log lists what to fix.

## 5. Worker in Coolify
New resource → same repo → build pack **Dockerfile**:
- Base directory `/`, Dockerfile location `apps/worker/Dockerfile`. **No domain, no exposed port**; disable the HTTP health check.
- Environment: see `deploy/worker/.env.example` (`DATABASE_URL` = the internal Postgres URL, `R2_*`, `ASSEMBLYAI_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`, `WORKER_CONCURRENCY=1`).
- Resource limits: **2 CPUs, 4.5 GB** memory. A 20-minute 1080p export takes roughly 15–20 minutes at this size.
- Stop grace period **40 s**, so a deploy lets a running job finish or return to the queue.

With Postgres's 1 GB, this leaves about 1 GB for Coolify, Traefik and builds (limits are caps, not reservations, so they only bite when everything peaks at once). Anything else on the server shares that margin: check `docker stats` during an export. Builds also run on this server: a deploy during a long render is slower, and Coolify can build on another server later if that becomes a problem.

## 6. Email (Resend) and sign-in (Google)
- **Resend:** add the domain, create the DNS records it shows (SPF, DKIM), wait for "Verified", create an API key → worker `RESEND_API_KEY`, `EMAIL_FROM="Supertitle <noreply@usesupertitle.com>"`.
- **Google:** an OAuth client with redirect URI `https://usesupertitle.com/api/auth/callback/google`.
- **AssemblyAI:** a production key in the worker.

## 7. Paddle (production)
- Fill `apps/web/lib/legal.ts` and deploy, so `/terms`, `/privacy` and `/refunds` are live; then apply for the live account (Paddle reviews the website).
- Create the "Supertitle Creator" and "Supertitle Pro" products (monthly and yearly prices) → the four `PADDLE_PRICE_*`.
- API key + client-side token → `PADDLE_API_KEY`, `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` (rebuild after setting it).
- Notification destination `https://usesupertitle.com/api/webhooks/paddle` with the subscription events → `PADDLE_WEBHOOK_SECRET`.
- Checkout settings: default payment link `https://usesupertitle.com`.

## 8. Monitoring
- Uptime monitor on `https://usesupertitle.com/api/health` (200 = app and database up).
- A second one on `https://usesupertitle.com/api/health?deep=1&token=<HEALTH_TOKEN>`: 503 when no worker has reported in 3 minutes; the body shows queue depth and the oldest job's wait.
- Logs are JSON lines in each resource's log view; errors have `"level":"error"`.

## First deploy checklist
1. Web resource deploys, and its log prints "All migrations have been successfully applied" (later deploys: "No pending migrations to apply").
2. `https://usesupertitle.com` shows the landing page, and `/api/health` returns `{"ok":true}`.
3. Worker log shows `worker.started`, and the deep health check says 1 live worker.
4. Sign up, open the confirmation email's link (uploads wait for it), upload a short video, wait for "Ready", export, download. The upload also proves R2 accepts the part URLs' signed sizes.
5. Subscribe with a real card (refund it from Paddle afterwards), and check the plan changes after the webhook.
6. A 20-minute export, to confirm the timings on this server.

## Updating and rolling back
- Push to `main` → redeploy both resources (Coolify can do it on push). The new container migrates before it serves; if that fails it never turns healthy, and the old version keeps running. Read its log for the error.
- **Rollback:** redeploy the previous commit in Coolify. Migrations are forward-only, so a release must keep working with the previous schema for that to be safe (add columns as optional, remove them a release later).
