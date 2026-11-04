import path from 'node:path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cellHyperlink, httpUrl } from '../src/import/cells';
import { writeFixtureFile } from '../src/import/fixture';
import { readGuideFromFile } from '../src/import/read-guide';
import { importGuideFromFile } from '../src/import/run-import';
import { findRepoRoot } from '../src/pathways/seed';

const root = findRepoRoot(path.resolve(__dirname, '../../..'));
const filePath = path.join(root, 'data', 'SEC_Trail_Coordination_Guide_Draft_V2.xlsx');

async function httpLinks(file: string): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(file);
  const links: string[] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        const link = httpUrl(cellHyperlink(cell));
        if (link) links.push(link);
      });
    });
  });
  return links;
}

describe('guide import', () => {
  const prisma = new PrismaClient();

  beforeAll(async () => {
    await writeFixtureFile(filePath);
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "AuditLog", "Suggestion", "Checklist", "StepResource", "PathwayStep", "Pathway", "PlayerRole", "Resource", "RoleType", "TopicLearning", "Topic", "MagicLinkToken", "User", "Organization" CASCADE',
    );
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('imports the workbook, captures every hyperlink, and changes nothing on a second run', async () => {
    const guide = await readGuideFromFile(filePath);
    expect(guide.topics).toHaveLength(12);
    expect(guide.orgs).toHaveLength(29);
    expect(guide.roles.length).toBe(29 * 12 - 2);
    expect(guide.warnings).toEqual([]);

    const first = await importGuideFromFile(prisma, filePath);
    expect(first.created.topics).toBe(12);
    expect(first.created.organizations).toBe(29);
    expect(first.created.playerRoles).toBe(guide.roles.length);
    expect(await prisma.topic.count()).toBe(12);
    expect(await prisma.organization.count()).toBe(29);
    expect(await prisma.playerRole.count()).toBe(guide.roles.length);

    const names = await prisma.organization.groupBy({ by: ['name'], _count: { _all: true } });
    expect(names.every((row) => row._count._all === 1)).toBe(true);
    const resourceKeys = await prisma.resource.groupBy({
      by: ['url', 'title'],
      _count: { _all: true },
    });
    expect(resourceKeys.every((row) => row._count._all === 1)).toBe(true);

    const links = await httpLinks(filePath);
    expect(links.length).toBeGreaterThan(0);
    const orgs = await prisma.organization.findMany({ select: { websiteUrl: true } });
    const resources = await prisma.resource.findMany({ select: { url: true } });
    const stored = new Set(
      [...orgs.map((org) => org.websiteUrl), ...resources.map((resource) => resource.url)].filter(
        (url): url is string => Boolean(url),
      ),
    );
    for (const link of links) expect(stored.has(link)).toBe(true);

    const postgis = await prisma.$queryRaw<{ ext: string | null }[]>`
      SELECT extname AS ext FROM pg_extension WHERE extname = 'postgis'
    `;
    expect(postgis[0]?.ext).toBe('postgis');

    const beforeOrgs = await prisma.organization.findMany({ orderBy: { slug: 'asc' } });
    const beforeRoles = await prisma.playerRole.findMany({
      orderBy: [{ sourceSheet: 'asc' }, { sourceRow: 'asc' }],
    });
    const beforeResources = await prisma.resource.findMany({
      orderBy: [{ url: 'asc' }, { title: 'asc' }],
    });
    const beforeTopics = await prisma.topic.findMany({
      orderBy: { sortOrder: 'asc' },
      include: {
        learnings: { orderBy: { sortOrder: 'asc' } },
        roleTypes: { orderBy: { sortOrder: 'asc' } },
      },
    });
    const auditsBefore = await prisma.auditLog.count({ where: { action: 'import' } });

    const second = await importGuideFromFile(prisma, filePath);
    expect(second.created).toEqual({
      topics: 0,
      learnings: 0,
      roleTypes: 0,
      organizations: 0,
      playerRoles: 0,
      resources: 0,
    });
    expect(second.updated).toEqual(second.created);

    expect(await prisma.organization.findMany({ orderBy: { slug: 'asc' } })).toEqual(beforeOrgs);
    expect(
      await prisma.playerRole.findMany({ orderBy: [{ sourceSheet: 'asc' }, { sourceRow: 'asc' }] }),
    ).toEqual(beforeRoles);
    expect(await prisma.resource.findMany({ orderBy: [{ url: 'asc' }, { title: 'asc' }] })).toEqual(
      beforeResources,
    );
    expect(
      await prisma.topic.findMany({
        orderBy: { sortOrder: 'asc' },
        include: {
          learnings: { orderBy: { sortOrder: 'asc' } },
          roleTypes: { orderBy: { sortOrder: 'asc' } },
        },
      }),
    ).toEqual(beforeTopics);
    expect(await prisma.auditLog.count({ where: { action: 'import' } })).toBe(auditsBefore + 1);
  });
});
