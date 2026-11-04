import { PrismaClient, type OrgKind, type Prisma } from '@prisma/client';
import type { GuideOrg, GuideTopic, InterpretedGuide } from './read-guide';
import { readGuideFromBuffer, readGuideFromFile } from './read-guide';

export type ImportSummary = {
  created: Record<string, number>;
  updated: Record<string, number>;
  unchanged: Record<string, number>;
  warnings: string[];
};

const ENTITIES = [
  'topics',
  'learnings',
  'roleTypes',
  'organizations',
  'playerRoles',
  'resources',
] as const;

function emptyCounts(): Record<string, number> {
  return Object.fromEntries(ENTITIES.map((name) => [name, 0]));
}

function bump(bucket: Record<string, number>, key: string): void {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function formatSummary(summary: ImportSummary): string {
  const lines = ['Import summary'];
  for (const name of ENTITIES) {
    lines.push(
      `${name}: created ${summary.created[name] ?? 0}, updated ${summary.updated[name] ?? 0}, unchanged ${summary.unchanged[name] ?? 0}`,
    );
  }
  if (summary.warnings.length === 0) lines.push('Warnings: none');
  else {
    lines.push('Warnings:');
    for (const warning of summary.warnings) lines.push(`- ${warning}`);
  }
  return lines.join('\n');
}

export async function importGuideFromFile(
  prisma: PrismaClient,
  filePath: string,
): Promise<ImportSummary> {
  const guide = await readGuideFromFile(filePath);
  return importInterpretedGuide(prisma, guide);
}

export async function importGuideFromBuffer(
  prisma: PrismaClient,
  buffer: Buffer,
): Promise<ImportSummary> {
  const guide = await readGuideFromBuffer(buffer);
  return importInterpretedGuide(prisma, guide);
}

export async function importInterpretedGuide(
  prisma: PrismaClient,
  guide: InterpretedGuide,
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    created: emptyCounts(),
    updated: emptyCounts(),
    unchanged: emptyCounts(),
    warnings: [...guide.warnings],
  };

  await prisma.$transaction(
    async (tx) => {
      const topicIds = new Map<string, string>();
      for (const topic of guide.topics) {
        topicIds.set(topic.slug, await upsertTopic(tx, topic, summary));
      }

      const orgIds = new Map<string, string>();
      for (const org of guide.orgs) {
        orgIds.set(org.slug, await upsertOrg(tx, org, summary));
      }

      const resourceIds = new Map<string, string>();
      for (const resource of guide.resources) {
        const ownerId = orgIds.get(resource.ownerSlug) ?? null;
        const key = `${resource.url}||${resource.title}`;
        resourceIds.set(key, await upsertResource(tx, resource, ownerId, summary));
      }

      for (const role of guide.roles) {
        const organizationId = orgIds.get(role.orgSlug);
        const topicId = topicIds.get(role.topicSlug);
        if (!organizationId || !topicId) {
          throw new Error(
            `Missing organization or topic for ${role.sourceSheet} row ${role.sourceRow}.`,
          );
        }
        const linked = role.resourceKeys.map((key) => {
          const id = resourceIds.get(key);
          if (!id) throw new Error(`Missing resource ${key}`);
          return id;
        });
        await upsertRole(tx, { ...role, organizationId, topicId, resourceIds: linked }, summary);
      }

      await tx.auditLog.create({
        data: {
          actorId: null,
          action: 'import',
          entityType: 'guide',
          entityId: 'spreadsheet',
          diff: {
            before: null,
            after: {
              created: summary.created,
              updated: summary.updated,
              unchanged: summary.unchanged,
              warnings: summary.warnings,
              contactNote: guide.contactNote,
            },
          },
        },
      });
    },
    { timeout: 180000, maxWait: 20000 },
  );

  return summary;
}

type Tx = Prisma.TransactionClient;

async function upsertTopic(tx: Tx, topic: GuideTopic, summary: ImportSummary): Promise<string> {
  const existing = await tx.topic.findUnique({
    where: { slug: topic.slug },
    include: { learnings: true, roleTypes: true },
  });
  let topicId: string;
  if (!existing) {
    const created = await tx.topic.create({
      data: {
        slug: topic.slug,
        name: topic.name,
        question: topic.question,
        sortOrder: topic.sortOrder,
      },
    });
    topicId = created.id;
    bump(summary.created, 'topics');
  } else if (
    existing.name !== topic.name ||
    existing.question !== topic.question ||
    existing.sortOrder !== topic.sortOrder
  ) {
    await tx.topic.update({
      where: { id: existing.id },
      data: { name: topic.name, question: topic.question, sortOrder: topic.sortOrder },
    });
    topicId = existing.id;
    bump(summary.updated, 'topics');
  } else {
    topicId = existing.id;
    bump(summary.unchanged, 'topics');
  }

  await syncLearnings(tx, topicId, existing?.learnings ?? [], topic.learnings, summary);
  await syncRoleTypes(tx, topicId, existing?.roleTypes ?? [], topic.roleTypes, summary);
  return topicId;
}

async function syncLearnings(
  tx: Tx,
  topicId: string,
  existing: { id: string; heading: string; body: string; sortOrder: number }[],
  incoming: GuideTopic['learnings'],
  summary: ImportSummary,
): Promise<void> {
  const byHeading = new Map(existing.map((row) => [row.heading, row]));
  const seen = new Set<string>();
  for (const learning of incoming) {
    seen.add(learning.heading);
    const row = byHeading.get(learning.heading);
    if (!row) {
      await tx.topicLearning.create({
        data: {
          topicId,
          heading: learning.heading,
          body: learning.body,
          sortOrder: learning.sortOrder,
        },
      });
      bump(summary.created, 'learnings');
    } else if (row.body !== learning.body || row.sortOrder !== learning.sortOrder) {
      await tx.topicLearning.update({
        where: { id: row.id },
        data: { body: learning.body, sortOrder: learning.sortOrder },
      });
      bump(summary.updated, 'learnings');
    } else {
      bump(summary.unchanged, 'learnings');
    }
  }
  const stale = existing.filter((row) => !seen.has(row.heading)).map((row) => row.id);
  if (stale.length > 0) await tx.topicLearning.deleteMany({ where: { id: { in: stale } } });
}

async function syncRoleTypes(
  tx: Tx,
  topicId: string,
  existing: { id: string; name: string; definition: string; sortOrder: number }[],
  incoming: GuideTopic['roleTypes'],
  summary: ImportSummary,
): Promise<void> {
  const byName = new Map(existing.map((row) => [row.name, row]));
  const seen = new Set<string>();
  for (const roleType of incoming) {
    seen.add(roleType.name);
    const row = byName.get(roleType.name);
    if (!row) {
      await tx.roleType.create({
        data: {
          topicId,
          name: roleType.name,
          definition: roleType.definition,
          sortOrder: roleType.sortOrder,
        },
      });
      bump(summary.created, 'roleTypes');
    } else if (row.definition !== roleType.definition || row.sortOrder !== roleType.sortOrder) {
      await tx.roleType.update({
        where: { id: row.id },
        data: { definition: roleType.definition, sortOrder: roleType.sortOrder },
      });
      bump(summary.updated, 'roleTypes');
    } else {
      bump(summary.unchanged, 'roleTypes');
    }
  }
  const stale = existing.filter((row) => !seen.has(row.name)).map((row) => row.id);
  if (stale.length > 0) await tx.roleType.deleteMany({ where: { id: { in: stale } } });
}

async function upsertOrg(tx: Tx, org: GuideOrg, summary: ImportSummary): Promise<string> {
  const existing = await tx.organization.findUnique({ where: { slug: org.slug } });
  if (!existing) {
    const created = await tx.organization.create({
      data: {
        slug: org.slug,
        name: org.name,
        kind: org.kind,
        websiteUrl: org.websiteUrl,
        isGroup: org.isGroup,
        status: 'PUBLISHED',
        communities: [],
        reviewedAt: null,
        maintainerId: null,
      },
    });
    bump(summary.created, 'organizations');
    return created.id;
  }
  const kind = org.kind as OrgKind;
  const changed =
    existing.name !== org.name ||
    existing.kind !== kind ||
    existing.websiteUrl !== org.websiteUrl ||
    existing.isGroup !== org.isGroup;
  if (!changed) {
    bump(summary.unchanged, 'organizations');
    return existing.id;
  }
  await tx.organization.update({
    where: { id: existing.id },
    data: {
      name: org.name,
      kind,
      websiteUrl: org.websiteUrl,
      isGroup: org.isGroup,
      ...(existing.websiteUrl !== org.websiteUrl
        ? {
            linkStatus: 'UNCHECKED' as const,
            linkCheckedAt: null,
            linkFinalUrl: null,
            linkHttpStatus: null,
          }
        : {}),
    },
  });
  bump(summary.updated, 'organizations');
  return existing.id;
}

async function upsertResource(
  tx: Tx,
  resource: InterpretedGuide['resources'][number],
  ownerId: string | null,
  summary: ImportSummary,
): Promise<string> {
  const existing = await tx.resource.findUnique({
    where: { url_title: { url: resource.url, title: resource.title } },
  });
  if (!existing) {
    const created = await tx.resource.create({
      data: {
        title: resource.title,
        url: resource.url,
        kind: resource.kind,
        ownerOrgId: ownerId,
        reviewedAt: null,
        maintainerId: null,
        linkStatus: 'UNCHECKED',
      },
    });
    bump(summary.created, 'resources');
    return created.id;
  }
  // TODO(spec): a resource can be named by more than one organization. Keep the first owner.
  const nextOwner = existing.ownerOrgId ?? ownerId;
  const changed = existing.kind !== resource.kind || existing.ownerOrgId !== nextOwner;
  if (!changed) {
    bump(summary.unchanged, 'resources');
    return existing.id;
  }
  await tx.resource.update({
    where: { id: existing.id },
    data: { kind: resource.kind, ownerOrgId: nextOwner },
  });
  bump(summary.updated, 'resources');
  return existing.id;
}

async function upsertRole(
  tx: Tx,
  role: {
    organizationId: string;
    topicId: string;
    roleLabel: string;
    roleTypeNames: string[];
    roleQualifier: string | null;
    isDocumented: boolean;
    hasRole: boolean;
    resourcesText: string | null;
    needsText: string | null;
    sourceSheet: string;
    sourceRow: number;
    resourceIds: string[];
  },
  summary: ImportSummary,
): Promise<void> {
  const existing = await tx.playerRole.findUnique({
    where: {
      organizationId_topicId: { organizationId: role.organizationId, topicId: role.topicId },
    },
    include: { resources: { select: { id: true } } },
  });
  const linkIds = [...role.resourceIds].sort();
  if (!existing) {
    await tx.playerRole.create({
      data: {
        organizationId: role.organizationId,
        topicId: role.topicId,
        roleLabel: role.roleLabel,
        roleTypeNames: role.roleTypeNames,
        roleQualifier: role.roleQualifier,
        isDocumented: role.isDocumented,
        hasRole: role.hasRole,
        resourcesText: role.resourcesText,
        needsText: role.needsText,
        sourceSheet: role.sourceSheet,
        sourceRow: role.sourceRow,
        status: 'PUBLISHED',
        reviewedAt: null,
        maintainerId: null,
        resources: { connect: linkIds.map((id) => ({ id })) },
      },
    });
    bump(summary.created, 'playerRoles');
    return;
  }
  const existingLinkIds = existing.resources.map((resource) => resource.id).sort();
  const fieldsSame =
    existing.roleLabel === role.roleLabel &&
    sameStrings(existing.roleTypeNames, role.roleTypeNames) &&
    existing.roleQualifier === role.roleQualifier &&
    existing.isDocumented === role.isDocumented &&
    existing.hasRole === role.hasRole &&
    existing.resourcesText === role.resourcesText &&
    existing.needsText === role.needsText &&
    existing.sourceSheet === role.sourceSheet &&
    existing.sourceRow === role.sourceRow &&
    sameStrings(existingLinkIds, linkIds);
  if (fieldsSame) {
    bump(summary.unchanged, 'playerRoles');
    return;
  }
  await tx.playerRole.update({
    where: { id: existing.id },
    data: {
      roleLabel: role.roleLabel,
      roleTypeNames: role.roleTypeNames,
      roleQualifier: role.roleQualifier,
      isDocumented: role.isDocumented,
      hasRole: role.hasRole,
      resourcesText: role.resourcesText,
      needsText: role.needsText,
      sourceSheet: role.sourceSheet,
      sourceRow: role.sourceRow,
      resources: { set: linkIds.map((id) => ({ id })) },
    },
  });
  bump(summary.updated, 'playerRoles');
}
