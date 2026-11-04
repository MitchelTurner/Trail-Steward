import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { PrismaClient, importGuideFromBuffer } from 'db';
import { freshness } from 'shared';
import { cleanupCutoff } from './cleanup';
import { checkUrl, mapPool } from './link-check';
import { coordinatorDigest, maintainerDigest, type DigestItem } from './reminders';
import { EmailService } from './email.service';

const log = new Logger('Jobs');

function summary(queue: string, extra: Record<string, unknown>): void {
  log.log(JSON.stringify({ queue, ...extra }));
}

@Processor('link-check')
export class LinkCheckProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  async process(): Promise<{ checked: number; broken: number }> {
    const [resources, orgs] = await Promise.all([
      this.prisma.resource.findMany({ select: { id: true, url: true } }),
      this.prisma.organization.findMany({
        where: { websiteUrl: { not: null } },
        select: { id: true, websiteUrl: true },
      }),
    ]);
    const checkedAt = new Date();
    const resourceResults = await mapPool(resources, 4, async (resource) => {
      const outcome = await checkUrl(resource.url);
      await this.prisma.resource.update({
        where: { id: resource.id },
        data: { ...outcome, linkCheckedAt: checkedAt },
      });
      return outcome.linkStatus;
    });
    // TODO(spec): organizations have no link-status columns. Websites are checked and logged only.
    const orgResults = await mapPool(
      orgs.filter((org): org is { id: string; websiteUrl: string } => Boolean(org.websiteUrl)),
      4,
      async (org) => {
        const outcome = await checkUrl(org.websiteUrl);
        return { id: org.id, ...outcome };
      },
    );
    const broken = resourceResults.filter((status) => status === 'BROKEN').length;
    summary('link-check', {
      resources: resources.length,
      broken,
      orgWebsites: orgResults.length,
      orgBroken: orgResults.filter((item) => item.linkStatus === 'BROKEN').length,
    });
    return { checked: resources.length, broken };
  }
}

@Processor('review-reminders')
export class ReviewReminderProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly email: EmailService,
  ) {
    super();
  }

  async process(): Promise<{ maintainers: number; coordinators: number }> {
    const now = new Date();
    const [orgs, roles, resources, pathways, coordinators] = await Promise.all([
      this.prisma.organization.findMany({ include: { maintainer: true } }),
      this.prisma.playerRole.findMany({
        include: { maintainer: true, organization: true, topic: true },
      }),
      this.prisma.resource.findMany({ include: { maintainer: true } }),
      this.prisma.pathway.findMany({ include: { maintainer: true } }),
      this.prisma.user.findMany({
        where: { isActive: true, role: { in: ['COORDINATOR', 'ADMIN'] } },
      }),
    ]);
    const items: DigestItem[] = [
      ...orgs.map((org) => ({
        label: org.name,
        freshness: freshness(org.reviewedAt, org.reviewIntervalDays, now),
        maintainerEmail: org.maintainer?.email ?? null,
        maintainerName: org.maintainer?.name ?? null,
      })),
      ...roles.map((role) => ({
        label: `${role.organization.name} — ${role.topic.name}`,
        freshness: freshness(role.reviewedAt, role.reviewIntervalDays, now),
        maintainerEmail: role.maintainer?.email ?? null,
        maintainerName: role.maintainer?.name ?? null,
      })),
      ...resources.map((resource) => ({
        label: resource.title,
        freshness: freshness(resource.reviewedAt, resource.reviewIntervalDays, now),
        maintainerEmail: resource.maintainer?.email ?? null,
        maintainerName: resource.maintainer?.name ?? null,
        linkStatus: resource.linkStatus,
      })),
      ...pathways.map((pathway) => ({
        label: pathway.title,
        freshness: freshness(pathway.reviewedAt, pathway.reviewIntervalDays, now),
        maintainerEmail: pathway.maintainer?.email ?? null,
        maintainerName: pathway.maintainer?.name ?? null,
      })),
    ];
    const digests = maintainerDigest(items);
    for (const [email, digest] of digests) {
      await this.email.send({
        to: email,
        subject: 'Trail Steward review reminder',
        text: `Hello${digest.name ? ` ${digest.name}` : ''},\n\nThese items need you:\n\n${digest.lines.join('\n')}\n`,
      });
    }
    const lines = coordinatorDigest(items);
    if (lines.length > 0) {
      for (const coordinator of coordinators) {
        await this.email.send({
          to: coordinator.email,
          subject: 'Trail Steward items with no review',
          text: `These items have no maintainer or have never been reviewed:\n\n${lines.join('\n')}\n`,
        });
      }
    }
    summary('review-reminders', {
      maintainers: digests.size,
      coordinators: lines.length > 0 ? coordinators.length : 0,
    });
    return { maintainers: digests.size, coordinators: lines.length > 0 ? coordinators.length : 0 };
  }
}

@Processor('checklist-cleanup')
export class ChecklistCleanupProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  async process(): Promise<{ deleted: number }> {
    const cutoff = cleanupCutoff();
    const result = await this.prisma.checklist.deleteMany({
      where: { lastOpenedAt: { lt: cutoff } },
    });
    summary('checklist-cleanup', { deleted: result.count, cutoff: cutoff.toISOString() });
    return { deleted: result.count };
  }
}

type ImportPayload = { filename?: string; contentBase64?: string };

@Processor('import-guide')
export class ImportGuideProcessor extends WorkerHost {
  constructor(private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<ImportPayload>): Promise<unknown> {
    const encoded = job.data.contentBase64;
    if (!encoded) throw new Error('Import job is missing the workbook.');
    const buffer = Buffer.from(encoded, 'base64');
    const summaryResult = await importGuideFromBuffer(this.prisma, buffer);
    summary('import-guide', {
      filename: job.data.filename ?? 'guide.xlsx',
      created: summaryResult.created,
      warnings: summaryResult.warnings.length,
    });
    return summaryResult;
  }
}
