-- AlterEnum
ALTER TYPE "ExportStatus" ADD VALUE 'EXPIRED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "JobType" ADD VALUE 'SEND_EMAIL';
ALTER TYPE "JobType" ADD VALUE 'RETENTION_SWEEP';
ALTER TYPE "JobType" ADD VALUE 'DELETE_ACCOUNT_ASSETS';

-- AlterTable
ALTER TABLE "job" ADD COLUMN     "dedupeKey" TEXT,
ALTER COLUMN "projectId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sourceDeletedAt" TIMESTAMP(3),
ADD COLUMN     "sourceExpiryWarnedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user" ADD COLUMN     "emailOnExport" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "job_dedupeKey_key" ON "job"("dedupeKey");

