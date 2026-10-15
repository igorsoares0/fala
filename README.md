# Fala

Web SaaS that turns short videos into captioned MP4s: upload → automatic transcription → text-based caption editor → style → export.

- Product spec: [`docs/Spec-Driven-Development-video-captioning-saas.md`](docs/Spec-Driven-Development-video-captioning-saas.md)
- Design handoff: [`docs/design_handoff_fala_captions/`](docs/design_handoff_fala_captions/README.md)

## Repository layout

| Path | What |
|---|---|
| `apps/web` | Next.js app (UI, Server Actions, auth, upload API) |
| `apps/worker` | `@fala/worker` — background jobs from the Postgres queue (video validation, thumbnails, transcription, asset cleanup); runs FFmpeg |
| `packages/shared` | `@fala/shared` — zod schemas and pure logic shared by web and worker (time units, project rules, upload limits, storage keys, job payloads, caption track + segmenter, caption style contract) |
| `packages/db` | `@fala/db` — Prisma schema, migrations, the database client and `enqueueJob` |
| `packages/storage` | `@fala/storage` — S3-compatible object storage client (R2 in production) |
| `fixtures/media` | Small synthetic test videos (regenerate with `scripts/make-media-fixtures.sh`) |
| `fixtures/eval` | Transcription evaluation clips + `manifest.json` (seed: `scripts/make-eval-fixtures.sh`) |

Conventions: all code is in English; times and durations are integer milliseconds.

## Local setup

Requires Node 22+, Docker and FFmpeg (`sudo apt install ffmpeg`; the worker's Docker image brings its own).

```bash
cp .env.example .env          # then set BETTER_AUTH_SECRET (openssl rand -base64 32)
docker compose up -d          # Postgres on :5434 (fala_dev, fala_test) and S3 storage on :8333 (buckets fala-dev, fala-test)
npm install
npm run db:generate
npm run db:migrate
npm run dev                   # http://localhost:3000
npm run dev:worker            # in another terminal: processes uploads
```

Local object storage is [SeaweedFS](https://github.com/seaweedfs/seaweedfs) (`weed mini`), an S3-compatible server; MinIO no longer publishes community images. Credentials are in `docker/seaweedfs-s3.json` and match `.env.example`.

Transcription uses [AssemblyAI](https://www.assemblyai.com). Without a key, keep `TRANSCRIPTION_PROVIDER="fake"` in `.env`: the worker then produces the same scripted captions for every video. For real captions set `TRANSCRIPTION_PROVIDER="assemblyai"` and `ASSEMBLYAI_API_KEY`.

Google sign-in is optional locally: set `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to enable the button. Password-reset emails are printed to the dev server log until Resend is wired in.

## Scripts

| Command | What |
|---|---|
| `npm run dev` / `build` / `start` | Next.js app (loads the root `.env`) |
| `npm run dev:worker` | Worker with reload on change |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript across workspaces |
| `npm test` | Vitest: unit tests + integration tests against `fala_test` and the `fala-test` bucket (needs FFmpeg) |
| `npm run test:e2e` | Playwright against a production build on port 3100 plus a worker, using `fala_test` and `fala-test` (first run: `npx playwright install chromium` in `apps/web`) |
| `npm run db:migrate` | Create/apply Prisma migrations on the dev database |
| `npm run eval:transcription` | Runs the real transcription provider over `fixtures/eval` and prints WER, detected language and model (needs `ASSEMBLYAI_API_KEY`; costs a few cents) |

## Decisions that differ from the spec

- **Auth: Better Auth instead of Auth.js.** Auth.js is in security-maintenance mode, and its email/password support requires hand-rolled hashing with JWT sessions. Better Auth provides Google + email/password + password reset natively, with database sessions through the Prisma adapter.
- **Prisma lives in `packages/db`** (not a root `prisma/`), so web and worker import the same generated client.
- **Captions are one JSON document per project (`CaptionTrack`: `words` + `blocks`) instead of a `CaptionBlock` table.** The editor works on word timings plus blocks as word-index ranges, edits and undoes them as a whole, and "Words per block" re-segments every block, so each save rewrites the set anyway. The document is validated with `captionTrackSchema` on read and write, and `version` guards concurrent saves. The provider's original output stays untouched in `Transcript`.

## Uploads and processing

1. The browser creates the project, then asks `POST /api/projects/:id/uploads/presign` for a 15-minute URL signed for that object key and Content-Type.
2. It PUTs the file straight to storage (the bytes never pass through Next.js), then calls `POST /api/projects/:id/uploads/complete`.
3. The server checks the stored object and, in one transaction, marks the project `UPLOADED` and queues a `VALIDATE_VIDEO` job.
4. The worker claims jobs with `FOR UPDATE SKIP LOCKED` and a renewable 60s lease. `VALIDATE_VIDEO` downloads the file, runs `ffprobe` (container, video and audio streams, ≤ 3 min, ≤ 1 GB), stores a thumbnail, marks the project `PROCESSING` and queues `TRANSCRIBE_VIDEO`. Invalid files end in `FAILED` with an error code.
5. `TRANSCRIBE_VIDEO` extracts mono 16 kHz audio, transcribes it with word timestamps, segments the words into caption blocks (`segmentWords` in `@fala/shared`), stores the `Transcript` and the editable `CaptionTrack`, and marks the project `READY`. Silent audio ends in `NO_SPEECH`; provider failures end in `TRANSCRIPTION_FAILED`, which the user can retry without uploading again.
6. Unexpected errors retry with exponential backoff (3 attempts). Invalid files fail at once. A crashed worker's job is picked up again when its lease expires. Deleting a project queues `DELETE_PROJECT_ASSETS`, which removes everything under its storage prefix and its captions.

### Transcription and privacy

Audio is sent to AssemblyAI (US by default; set `ASSEMBLYAI_BASE_URL=https://api.eu.assemblyai.com` for the EU). Language is detected automatically; AssemblyAI routes the 18 languages Universal-3.5 Pro covers to it and the rest (99 in total) to Universal-2. Right after the result arrives, the worker deletes the transcript at AssemblyAI, which also deletes the uploaded audio. The privacy policy must say that audio is processed by this third party.

### Evaluating transcription

`fixtures/eval/manifest.json` lists clips with their language and reference text. The seed clips are synthetic speech (espeak-ng) in four languages: a smoke test only. Add real recordings to cover accents, fast speech, noise, music and technical terms — for example CC0 clips from [Common Voice](https://commonvoice.mozilla.org) — and run `npm run eval:transcription` before switching providers or models.

### Deploying the worker

`docker compose --profile worker up --build worker` runs the production image (`apps/worker/Dockerfile`: Node 24 + pinned static FFmpeg) against the local stack. On the server, run the same image with `restart: unless-stopped`, `DATABASE_URL`, the `R2_*` variables, `ASSEMBLYAI_API_KEY` and `WORKER_CONCURRENCY`. The image refuses `TRANSCRIPTION_PROVIDER=fake`. On SIGTERM it stops claiming jobs, waits up to 25s, then releases unfinished jobs back to the queue.

### R2 bucket setup

Keep the bucket private. Add a CORS rule allowing `PUT` and `GET` from the app's origin with the `Content-Type` header. Set `R2_ENDPOINT` to `https://<account-id>.r2.cloudflarestorage.com`.
