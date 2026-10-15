-- CreateTable
CREATE TABLE "project_style" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "presetKey" TEXT NOT NULL,
    "configuration" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_style_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_style_projectId_key" ON "project_style"("projectId");

-- AddForeignKey
ALTER TABLE "project_style" ADD CONSTRAINT "project_style_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
