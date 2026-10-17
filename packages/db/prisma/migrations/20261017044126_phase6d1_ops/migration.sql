-- CreateTable
CREATE TABLE "worker_heartbeat" (
    "workerId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "runningJobs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "worker_heartbeat_pkey" PRIMARY KEY ("workerId")
);

-- CreateTable
CREATE TABLE "rate_limit_bucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_bucket_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "rate_limit_bucket_expiresAt_idx" ON "rate_limit_bucket"("expiresAt");

