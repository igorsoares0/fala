# Web app image (Next.js standalone server). Build from the repo root:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=… --build-arg R2_ENDPOINT=… .
# The image also carries the Prisma CLI and migrations in /migrate, so the deploy can
# run them first: cd /migrate && DATABASE_URL="$DIRECT_DATABASE_URL" npx prisma migrate deploy

# Manifests of the web app and the packages it uses only (not the worker).
FROM node:24-bookworm-slim AS manifests
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/storage/package.json packages/storage/

FROM manifests AS build
RUN npm ci --include=dev -w @fala/web -w @fala/db -w @fala/shared -w @fala/storage
COPY packages packages
COPY apps/web apps/web
# Reads the datasource URL from config but never connects.
RUN cd packages/db && DATABASE_URL=postgresql://build@localhost/build npx prisma generate
# Inlined into the build: the client-side Paddle token and the storage origin (CSP).
ARG NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=""
ARG R2_ENDPOINT=""
ARG APP_URL=""
ENV NEXT_PUBLIC_PADDLE_CLIENT_TOKEN=$NEXT_PUBLIC_PADDLE_CLIENT_TOKEN \
    R2_ENDPOINT=$R2_ENDPOINT \
    APP_URL=$APP_URL \
    NEXT_TELEMETRY_DISABLED=1
# Modules that set up a database client are loaded while collecting page data; the
# client only connects on a query, so a placeholder URL keeps the build offline.
RUN cd apps/web && DATABASE_URL=postgresql://build@localhost/build npx next build

# Prisma CLI + migrations only, for the pre-deploy migration step.
FROM node:24-bookworm-slim AS migrate
WORKDIR /migrate
RUN npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund prisma@7.10.0 dotenv@17 && npm cache clean --force
COPY packages/db/prisma prisma
COPY packages/db/prisma.config.ts .

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static apps/web/.next/static
COPY --from=migrate --chown=node:node /migrate /migrate
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["node", "apps/web/server.js"]
