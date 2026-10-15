# Worker image (spec §18.2). Build from the repo root:
#   docker build -f apps/worker/Dockerfile .
# FFmpeg comes from a pinned static build, so the version doesn't drift with the base image.
FROM mwader/static-ffmpeg:9.0.2 AS ffmpeg

# Manifests of the worker and the packages it uses only (not the web app).
FROM node:24-bookworm-slim AS manifests
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/storage/package.json packages/storage/

# Generates the Prisma client; needs the Prisma CLI (a dev dependency).
FROM manifests AS build
RUN npm ci --include=dev -w @fala/db
COPY packages/db/prisma packages/db/prisma
COPY packages/db/prisma.config.ts packages/db/
# Reads the datasource URL from config but never connects.
RUN cd packages/db && DATABASE_URL=postgresql://build@localhost/build npx prisma generate

FROM manifests AS runtime
ENV NODE_ENV=production \
    TEMP_DIR=/tmp/fala-worker \
    FFMPEG_PATH=/usr/local/bin/ffmpeg \
    FFPROBE_PATH=/usr/local/bin/ffprobe
RUN npm ci --omit=dev -w @fala/worker -w @fala/db -w @fala/shared -w @fala/storage \
    && npm cache clean --force
COPY --from=ffmpeg /ffmpeg /ffprobe /usr/local/bin/
COPY packages/shared/src packages/shared/src
COPY packages/storage/src packages/storage/src
COPY packages/db/src packages/db/src
COPY --from=build /app/packages/db/src/generated packages/db/src/generated
COPY apps/worker/src apps/worker/src

USER node
WORKDIR /app/apps/worker
CMD ["node", "--import", "tsx", "src/main.ts"]
