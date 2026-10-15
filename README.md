# Fala

Web SaaS that turns short videos into captioned MP4s: upload → automatic transcription → text-based caption editor → style → export.

- Product spec: [`docs/Spec-Driven-Development-video-captioning-saas.md`](docs/Spec-Driven-Development-video-captioning-saas.md)
- Design handoff: [`docs/design_handoff_fala_captions/`](docs/design_handoff_fala_captions/README.md)

## Repository layout

| Path | What |
|---|---|
| `apps/web` | Next.js app (UI, Server Actions, auth) |
| `packages/shared` | `@fala/shared` — zod schemas and pure logic shared by web and the future worker (time units, project rules, caption style contract) |
| `packages/db` | `@fala/db` — Prisma schema, migrations and the database client |

Conventions: all code is in English; times and durations are integer milliseconds.

## Local setup

Requires Node 22+ and Docker.

```bash
cp .env.example .env          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d          # Postgres on localhost:5434 (databases fala_dev and fala_test)
npm install
npm run db:generate
npm run db:migrate
npm run dev                   # http://localhost:3000
```

Google sign-in is optional locally: set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to enable the button. Password-reset emails are printed to the dev server log until Resend is wired in.

## Scripts

| Command | What |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app (loads the root `.env`) |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript across workspaces |
| `npm test` | Vitest: unit tests + integration tests against `fala_test` |
| `npm run test:e2e` | Playwright against a production build on port 3100 and `fala_test` (first run: `npx playwright install chromium` in `apps/web`) |
| `npm run db:migrate` | Create/apply Prisma migrations on the dev database |

## Decisions that differ from the spec

- **Auth: Better Auth instead of Auth.js.** Auth.js is in security-maintenance mode, and its email/password support requires hand-rolled hashing with JWT sessions. Better Auth provides Google + email/password + password reset natively, with database sessions through the Prisma adapter.
- **Prisma lives in `packages/db`** (not a root `prisma/`), so web and worker import the same generated client.
