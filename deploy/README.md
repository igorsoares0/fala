# Deploying Fala

Production runs in three places (spec §18): the **web app** (Vercel), the **database** (Neon) and the **worker** (a Docker host such as a Hetzner CX33). Files live in **Cloudflare R2**. Order matters: do the steps top to bottom.

## 1. Domain and email
- Point the domain at Vercel (step 4).
- In **Resend**, add the domain, create the DNS records it shows (SPF, DKIM), wait for "Verified", create an API key. Use `EMAIL_FROM="Fala <noreply@your-domain>"`.

## 2. Database (Neon)
- Create a project (region close to the worker and Vercel), and a database `fala`. Copy the **pooled** connection string for the app and the **direct** one for migrations.
- Point-in-time restore is on by default; check the retention on your plan.
- Apply migrations from your machine: `DATABASE_URL="<direct url>" npm run db:deploy`. Run this on every release that adds a migration, **before** deploying the app.

## 3. Storage (Cloudflare R2)
- Create a private bucket `fala` and an API token with read/write on it.
- **CORS:** allow `PUT` and `GET` from `https://your-domain` with the `Content-Type` header.
- **Lifecycle:** abort incomplete multipart uploads after 1 day.

## 4. Web (Vercel)
- Import the repo, root directory `apps/web`, framework Next.js.
- Environment variables: everything in `.env.example` with production values. In particular:
  - `BETTER_AUTH_URL` and `APP_URL` = `https://your-domain`, and a new `BETTER_AUTH_SECRET` (`openssl rand -base64 32`);
  - `PADDLE_ENV="production"` and the production Paddle keys/prices (step 6);
  - `HEALTH_TOKEN` for the deep health check.
- The app refuses to start while anything is missing or a legal placeholder is left (`apps/web/lib/legal.ts`). The error lists what to fix.

## 5. Worker
On the server (Docker installed):
```sh
git clone <repo> fala && cd fala/deploy/worker
cp .env.example .env    # fill it in
docker compose up -d --build
docker compose logs -f  # look for "worker.started"
```
Update with `git pull && docker compose up -d --build`. A deploy lets the running job finish or returns it to the queue.

## 6. Paddle (production)
- Apply for the live account: Paddle reviews the public website (landing, pricing, `/terms`, `/privacy`, `/refunds`). Fill `apps/web/lib/legal.ts` first.
- Create the "Fala Creator" and "Fala Pro" products with monthly and yearly prices, and set the four `PADDLE_PRICE_*` ids.
- Create an API key and a client-side token, and a notification destination `https://your-domain/api/webhooks/paddle` with the subscription events; its secret is `PADDLE_WEBHOOK_SECRET`.
- Set your domain as the default payment link (Checkout settings).

## 7. Sign-in and transcription
- **Google:** OAuth client with the redirect URI `https://your-domain/api/auth/callback/google`.
- **AssemblyAI:** a production key in the worker's `.env`.

## 8. Monitoring
- Uptime monitor on `https://your-domain/api/health` (200 = app and database up).
- A second one on `https://your-domain/api/health?deep=1&token=<HEALTH_TOKEN>`: 503 when no worker has been seen for 3 minutes; the body shows queue depth and the oldest job's wait.
- Logs are JSON lines: Vercel's log view for the app, `docker compose logs` for the worker. Errors have `"level":"error"`.
