-- AlterTable
ALTER TABLE "subscription" ADD COLUMN     "billingInterval" TEXT NOT NULL DEFAULT 'month',
ADD COLUMN     "cancelAt" TIMESTAMP(3),
ADD COLUMN     "paddleUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "pendingPlanKey" TEXT;

-- CreateTable
CREATE TABLE "paddle_event" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paddle_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paddle_event_eventId_key" ON "paddle_event"("eventId");
