-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "linkStatus" "LinkStatus" NOT NULL DEFAULT 'UNCHECKED',
ADD COLUMN "linkCheckedAt" TIMESTAMP(3),
ADD COLUMN "linkFinalUrl" TEXT,
ADD COLUMN "linkHttpStatus" INTEGER;
