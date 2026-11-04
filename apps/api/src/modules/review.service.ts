import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Freshness } from 'shared';
import { freshness, roleAtLeast } from 'shared';
import { AuditService } from '../audit.service';
import { PrismaService } from '../prisma.service';
import type { SessionUser } from '../session';

export type ReviewEntity =
  | 'organization'
  | 'playerRole'
  | 'resource'
  | 'pathway'
  | 'trail'
  | 'asset'
  | 'issue'
  | 'counter';

type ReviewItem = {
  entityType: ReviewEntity;
  id: string;
  label: string;
  freshness: Freshness;
  maintainerId: string | null;
  maintainerName: string | null;
  linkStatus?: string;
};

@Injectable()
export class ReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async markReviewed(entity: ReviewEntity, id: string, user: SessionUser) {
    const row = await this.load(entity, id);
    if (!roleAtLeast(user.role, 'COORDINATOR') && row.maintainerId !== user.id) {
      throw new ForbiddenException('Only the maintainer or a coordinator can mark this reviewed.');
    }
    const reviewedAt = new Date();
    await this.writeReviewedAt(entity, id, reviewedAt);
    await this.audit.record({
      actorId: user.id,
      action: 'review',
      entityType: entity,
      entityId: id,
      before: { reviewedAt: row.reviewedAt?.toISOString() ?? null },
      after: { reviewedAt: reviewedAt.toISOString() },
    });
    return {
      id,
      reviewedAt: reviewedAt.toISOString(),
      freshness: freshness(reviewedAt, row.reviewIntervalDays),
    };
  }

  async assignMaintainer(
    entity: ReviewEntity,
    id: string,
    maintainerId: string | null,
    user: SessionUser,
  ) {
    const row = await this.load(entity, id);
    if (maintainerId) {
      const maintainer = await this.prisma.user.findUnique({ where: { id: maintainerId } });
      if (!maintainer || !maintainer.isActive) throw new NotFoundException('Maintainer not found.');
    }
    await this.writeMaintainer(entity, id, maintainerId);
    await this.audit.record({
      actorId: user.id,
      action: 'update',
      entityType: entity,
      entityId: id,
      before: { maintainerId: row.maintainerId },
      after: { maintainerId },
    });
    return { id, maintainerId };
  }

  async dashboard() {
    const [orgs, roles, resources, pathways, trails, assets, issues, counters, changes, metrics] =
      await Promise.all([
      this.prisma.organization.findMany({
        include: { maintainer: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.playerRole.findMany({
        include: { maintainer: true, organization: true, topic: true },
        orderBy: [{ topic: { sortOrder: 'asc' } }, { organization: { name: 'asc' } }],
      }),
      this.prisma.resource.findMany({ include: { maintainer: true }, orderBy: { title: 'asc' } }),
      this.prisma.pathway.findMany({ include: { maintainer: true }, orderBy: { title: 'asc' } }),
      this.prisma.trail.findMany({ include: { maintainer: true }, orderBy: { name: 'asc' } }),
      this.prisma.asset.findMany({
        include: { maintainer: true, trail: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.issue.findMany({
        where: { ownerOrgId: null, status: 'OPEN' },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.counter.findMany({
        include: { maintainer: true, trail: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.changeRequest.findMany({
        where: { status: 'OPEN' },
        include: { trail: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.metrics(),
    ]);

    const sections = [
      this.section(
        'organizations',
        'Organizations',
        orgs.map((org) => ({
          entityType: 'organization' as const,
          id: org.id,
          label: org.name,
          freshness: freshness(org.reviewedAt, org.reviewIntervalDays),
          maintainerId: org.maintainerId,
          maintainerName: org.maintainer?.name ?? null,
        })),
      ),
      this.section(
        'playerRoles',
        'Player roles',
        roles.map((role) => ({
          entityType: 'playerRole' as const,
          id: role.id,
          label: `${role.organization.name} — ${role.topic.name}`,
          freshness: freshness(role.reviewedAt, role.reviewIntervalDays),
          maintainerId: role.maintainerId,
          maintainerName: role.maintainer?.name ?? null,
        })),
      ),
      this.section(
        'resources',
        'Resources',
        resources.map((resource) => ({
          entityType: 'resource' as const,
          id: resource.id,
          label: resource.title,
          freshness: freshness(resource.reviewedAt, resource.reviewIntervalDays),
          maintainerId: resource.maintainerId,
          maintainerName: resource.maintainer?.name ?? null,
          linkStatus: resource.linkStatus,
        })),
      ),
      this.section(
        'pathways',
        'Pathways',
        pathways.map((pathway) => ({
          entityType: 'pathway' as const,
          id: pathway.id,
          label: pathway.title,
          freshness: freshness(pathway.reviewedAt, pathway.reviewIntervalDays),
          maintainerId: pathway.maintainerId,
          maintainerName: pathway.maintainer?.name ?? null,
        })),
      ),
      this.section(
        'trails',
        'Trails',
        trails.map((trail) => ({
          entityType: 'trail' as const,
          id: trail.id,
          label: trail.name,
          freshness: freshness(trail.reviewedAt, trail.reviewIntervalDays),
          maintainerId: trail.maintainerId,
          maintainerName: trail.maintainer?.name ?? null,
        })),
      ),
      this.section(
        'assets',
        'Map points',
        assets.map((asset) => ({
          entityType: 'asset' as const,
          id: asset.id,
          label: `${asset.trail.name} — ${asset.name}`,
          freshness: freshness(asset.reviewedAt, asset.reviewIntervalDays),
          maintainerId: asset.maintainerId,
          maintainerName: asset.maintainer?.name ?? null,
        })),
      ),
      this.section(
        'issues',
        'Unowned issues',
        issues.map((issue) => ({
          entityType: 'issue' as const,
          id: issue.id,
          label: issue.title,
          freshness: freshness(issue.reviewedAt, issue.reviewIntervalDays),
          maintainerId: issue.maintainerId,
          maintainerName: null,
        })),
      ),
      this.section(
        'counters',
        'Counters',
        counters.map((counter) => ({
          entityType: 'counter' as const,
          id: counter.id,
          label: `${counter.trail.name} — ${counter.name}`,
          freshness: freshness(counter.reviewedAt, counter.reviewIntervalDays),
          maintainerId: counter.maintainerId,
          maintainerName: counter.maintainer?.name ?? null,
        })),
      ),
      {
        key: 'changeRequests',
        title: 'Map change requests',
        kind: 'queue' as const,
        counts: {
          stale: 0,
          due: 0,
          neverReviewed: changes.length,
          unassigned: 0,
        },
        items: changes.map((change) => ({
          entityType: 'changeRequest' as const,
          id: change.id,
          label: `${change.trail.name} — ${change.message}`,
          freshness: 'never-reviewed' as const,
          maintainerId: null,
          maintainerName: null,
        })),
      },
    ];
    return {
      sections,
      brokenLinks: resources
        .filter((resource) => resource.linkStatus === 'BROKEN')
        .map((resource) => ({
          entityType: 'resource' as const,
          id: resource.id,
          label: resource.title,
          url: resource.url,
          linkStatus: resource.linkStatus,
          maintainerName: resource.maintainer?.name ?? null,
        })),
      metrics,
    };
  }

  async metrics() {
    const [checklists, pdfDownloads] = await Promise.all([
      this.prisma.checklist.findMany({ select: { community: true, stepState: true } }),
      this.prisma.auditLog.count({ where: { action: 'pdf.download' } }),
    ]);
    const byCommunity = new Map<string, number>();
    let stepsCompleted = 0;
    for (const checklist of checklists) {
      const community = checklist.community?.trim() || 'Not set';
      byCommunity.set(community, (byCommunity.get(community) ?? 0) + 1);
      const state = checklist.stepState;
      if (state && typeof state === 'object' && !Array.isArray(state)) {
        for (const value of Object.values(state as Record<string, { done?: boolean }>)) {
          if (value && typeof value === 'object' && value.done) stepsCompleted += 1;
        }
      }
    }
    return {
      checklistsCreated: checklists.length,
      checklistsByCommunity: [...byCommunity.entries()]
        .map(([community, count]) => ({ community, count }))
        .sort((a, b) => b.count - a.count || a.community.localeCompare(b.community)),
      pdfDownloads,
      stepsCompleted,
    };
  }

  private section(key: string, title: string, items: ReviewItem[]) {
    const needsAttention = items.filter(
      (item) =>
        item.freshness !== 'current' || item.maintainerId == null || item.linkStatus === 'BROKEN',
    );
    return {
      key,
      title,
      counts: {
        stale: items.filter((item) => item.freshness === 'stale').length,
        due: items.filter((item) => item.freshness === 'due').length,
        neverReviewed: items.filter((item) => item.freshness === 'never-reviewed').length,
        unassigned: items.filter((item) => item.maintainerId == null).length,
      },
      items: needsAttention,
    };
  }

  private async load(entity: ReviewEntity, id: string) {
    const row =
      entity === 'organization'
        ? await this.prisma.organization.findUnique({ where: { id } })
        : entity === 'playerRole'
          ? await this.prisma.playerRole.findUnique({ where: { id } })
          : entity === 'resource'
            ? await this.prisma.resource.findUnique({ where: { id } })
            : entity === 'pathway'
              ? await this.prisma.pathway.findUnique({ where: { id } })
              : entity === 'trail'
                ? await this.prisma.trail.findUnique({ where: { id } })
                : entity === 'asset'
                  ? await this.prisma.asset.findUnique({ where: { id } })
                  : entity === 'counter'
                    ? await this.prisma.counter.findUnique({ where: { id } })
                    : await this.prisma.issue.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Record not found.');
    return row;
  }

  private async writeReviewedAt(entity: ReviewEntity, id: string, reviewedAt: Date) {
    const data = { reviewedAt };
    if (entity === 'organization') await this.prisma.organization.update({ where: { id }, data });
    else if (entity === 'playerRole') await this.prisma.playerRole.update({ where: { id }, data });
    else if (entity === 'resource') await this.prisma.resource.update({ where: { id }, data });
    else if (entity === 'pathway') await this.prisma.pathway.update({ where: { id }, data });
    else if (entity === 'trail') await this.prisma.trail.update({ where: { id }, data });
    else if (entity === 'asset') await this.prisma.asset.update({ where: { id }, data });
    else if (entity === 'counter') await this.prisma.counter.update({ where: { id }, data });
    else await this.prisma.issue.update({ where: { id }, data });
  }

  private async writeMaintainer(entity: ReviewEntity, id: string, maintainerId: string | null) {
    const data = { maintainerId };
    if (entity === 'organization') await this.prisma.organization.update({ where: { id }, data });
    else if (entity === 'playerRole') await this.prisma.playerRole.update({ where: { id }, data });
    else if (entity === 'resource') await this.prisma.resource.update({ where: { id }, data });
    else if (entity === 'pathway') await this.prisma.pathway.update({ where: { id }, data });
    else if (entity === 'trail') await this.prisma.trail.update({ where: { id }, data });
    else if (entity === 'asset') await this.prisma.asset.update({ where: { id }, data });
    else if (entity === 'counter') await this.prisma.counter.update({ where: { id }, data });
    else await this.prisma.issue.update({ where: { id }, data });
  }
}
