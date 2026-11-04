-- CreateEnum
CREATE TYPE "PacketStatus" AS ENUM ('DRAFT', 'READY', 'DONE');

-- CreateTable
CREATE TABLE "RepairPacket" (
    "id" TEXT NOT NULL,
    "trailId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "status" "PacketStatus" NOT NULL DEFAULT 'DRAFT',
    "issueIds" TEXT[],
    "workdayIds" TEXT[],
    "fileIds" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RepairPacket_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RepairPacket" ADD CONSTRAINT "RepairPacket_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "Trail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairPacket" ADD CONSTRAINT "RepairPacket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "RepairPacket_trailId_idx" ON "RepairPacket"("trailId");
