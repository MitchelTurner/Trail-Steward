-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "OrgKind" AS ENUM ('FEDERAL', 'STATE', 'LOCAL_GOVERNMENT', 'TRIBAL_GOVERNMENT', 'NATIVE_CORPORATION', 'STATE_LAND_TRUST', 'UNIVERSITY', 'NONPROFIT', 'COALITION', 'REGIONAL_ORG', 'ADVISORY_BODY', 'BUSINESS', 'PRIVATE_LANDOWNER', 'OTHER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('EDITOR', 'COORDINATOR', 'ADMIN');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('UNCHECKED', 'OK', 'REDIRECT', 'BROKEN');

-- CreateEnum
CREATE TYPE "SuggestionStatus" AS ENUM ('OPEN', 'ACCEPTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'PARTNERS', 'PRIVATE');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "kind" "OrgKind" NOT NULL,
    "websiteUrl" TEXT,
    "description" TEXT,
    "communities" TEXT[],
    "isGroup" BOOLEAN NOT NULL DEFAULT false,
    "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC',
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "maintainerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewIntervalDays" INTEGER NOT NULL DEFAULT 365,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TopicLearning" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "heading" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "TopicLearning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoleType" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "definition" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "RoleType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerRole" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "roleLabel" TEXT NOT NULL,
    "roleTypeNames" TEXT[],
    "roleQualifier" TEXT,
    "isDocumented" BOOLEAN NOT NULL DEFAULT true,
    "hasRole" BOOLEAN NOT NULL DEFAULT true,
    "resourcesText" TEXT,
    "needsText" TEXT,
    "status" "ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "maintainerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewIntervalDays" INTEGER NOT NULL DEFAULT 365,
    "sourceSheet" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT,
    "ownerOrgId" TEXT,
    "linkStatus" "LinkStatus" NOT NULL DEFAULT 'UNCHECKED',
    "linkCheckedAt" TIMESTAMP(3),
    "linkFinalUrl" TEXT,
    "linkHttpStatus" INTEGER,
    "maintainerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewIntervalDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pathway" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "questions" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "maintainerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewIntervalDays" INTEGER NOT NULL DEFAULT 180,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Pathway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PathwayStep" (
    "id" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "why" TEXT NOT NULL,
    "howTo" TEXT NOT NULL,
    "examples" TEXT,
    "topicSlugs" TEXT[],
    "prerequisiteKeys" TEXT[],
    "showIf" JSONB,
    "contactQuery" JSONB,

    CONSTRAINT "PathwayStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepResource" (
    "stepId" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StepResource_pkey" PRIMARY KEY ("stepId","resourceId")
);

-- CreateTable
CREATE TABLE "Checklist" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "pathwayId" TEXT NOT NULL,
    "pathwayVersion" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "stepState" JSONB NOT NULL,
    "community" TEXT,
    "lastOpenedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suggestion" (
    "id" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "message" TEXT NOT NULL,
    "proposedUrl" TEXT,
    "submitterName" TEXT,
    "submitterEmail" TEXT,
    "status" "SuggestionStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Suggestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'EDITOR',
    "organizationId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "diff" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_RoleResources" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_slug_key" ON "Topic"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "RoleType_topicId_name_key" ON "RoleType"("topicId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRole_organizationId_topicId_key" ON "PlayerRole"("organizationId", "topicId");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_url_title_key" ON "Resource"("url", "title");

-- CreateIndex
CREATE UNIQUE INDEX "Pathway_slug_key" ON "Pathway"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PathwayStep_pathwayId_key_key" ON "PathwayStep"("pathwayId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Checklist_token_key" ON "Checklist"("token");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_tokenHash_key" ON "MagicLinkToken"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "_RoleResources_AB_unique" ON "_RoleResources"("A", "B");

-- CreateIndex
CREATE INDEX "_RoleResources_B_index" ON "_RoleResources"("B");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_maintainerId_fkey" FOREIGN KEY ("maintainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TopicLearning" ADD CONSTRAINT "TopicLearning_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoleType" ADD CONSTRAINT "RoleType_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRole" ADD CONSTRAINT "PlayerRole_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRole" ADD CONSTRAINT "PlayerRole_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRole" ADD CONSTRAINT "PlayerRole_maintainerId_fkey" FOREIGN KEY ("maintainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_ownerOrgId_fkey" FOREIGN KEY ("ownerOrgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resource" ADD CONSTRAINT "Resource_maintainerId_fkey" FOREIGN KEY ("maintainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pathway" ADD CONSTRAINT "Pathway_maintainerId_fkey" FOREIGN KEY ("maintainerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PathwayStep" ADD CONSTRAINT "PathwayStep_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "Pathway"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepResource" ADD CONSTRAINT "StepResource_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "PathwayStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepResource" ADD CONSTRAINT "StepResource_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_pathwayId_fkey" FOREIGN KEY ("pathwayId") REFERENCES "Pathway"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Suggestion" ADD CONSTRAINT "Suggestion_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleResources" ADD CONSTRAINT "_RoleResources_A_fkey" FOREIGN KEY ("A") REFERENCES "PlayerRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleResources" ADD CONSTRAINT "_RoleResources_B_fkey" FOREIGN KEY ("B") REFERENCES "Resource"("id") ON DELETE CASCADE ON UPDATE CASCADE;
