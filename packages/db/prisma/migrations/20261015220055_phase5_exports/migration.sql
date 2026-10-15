-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'RENDERING', 'SUCCEEDED', 'FAILED');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'RENDER_EXPORT';

-- AlterTable
ALTER TABLE "job" ADD COLUMN     "exportId" TEXT;

-- CreateTable
CREATE TABLE "export" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "resolution" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "objectKey" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "durationMs" INTEGER,
    "fileSizeBytes" INTEGER,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "export_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "export_projectId_createdAt_idx" ON "export"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "export_status_idx" ON "export"("status");

-- CreateIndex
CREATE UNIQUE INDEX "export_projectId_version_key" ON "export"("projectId", "version");

-- CreateIndex
CREATE INDEX "job_exportId_idx" ON "job"("exportId");

-- AddForeignKey
ALTER TABLE "job" ADD CONSTRAINT "job_exportId_fkey" FOREIGN KEY ("exportId") REFERENCES "export"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export" ADD CONSTRAINT "export_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
