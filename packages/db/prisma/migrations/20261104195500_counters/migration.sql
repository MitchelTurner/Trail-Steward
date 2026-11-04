-- CreateEnum
CREATE TYPE "CounterKind" AS ENUM ('TRAIL', 'CABIN', 'OTHER');

-- CreateTable
CREATE TABLE "Counter" (
    "id" TEXT NOT NULL,
    "trailId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CounterKind" NOT NULL,
    "notes" TEXT,
    "maintainerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewIntervalDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterReading" (
    "id" TEXT NOT NULL,
    "counterId" TEXT NOT NULL,
    "recordedOn" DATE NOT NULL,
    "count" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounterReading_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "Trail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_maintainerId_fkey" FOREIGN KEY ("maintainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterReading" ADD CONSTRAINT "CounterReading_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
