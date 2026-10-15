-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'TRANSCRIBE_VIDEO';

-- AlterTable
ALTER TABLE "project" ADD COLUMN     "captionSample" JSONB;

-- CreateTable
CREATE TABLE "transcript" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceObjectKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "language" TEXT,
    "languageConfidence" DOUBLE PRECISION,
    "fullText" TEXT NOT NULL,
    "words" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caption_track" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "language" TEXT,
    "words" JSONB NOT NULL,
    "blocks" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caption_track_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transcript_projectId_key" ON "transcript"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "caption_track_projectId_key" ON "caption_track"("projectId");

-- AddForeignKey
ALTER TABLE "transcript" ADD CONSTRAINT "transcript_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "caption_track" ADD CONSTRAINT "caption_track_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
