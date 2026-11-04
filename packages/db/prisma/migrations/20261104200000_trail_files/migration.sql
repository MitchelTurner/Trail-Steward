-- CreateTable
CREATE TABLE "TrailFile" (
    "id" TEXT NOT NULL,
    "trailId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrailFile_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TrailFile" ADD CONSTRAINT "TrailFile_trailId_fkey" FOREIGN KEY ("trailId") REFERENCES "Trail"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrailFile" ADD CONSTRAINT "TrailFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
