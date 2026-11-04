import { PrismaClient } from '@prisma/client';
import { lineStringSchema } from 'shared';
import { afterAll, describe, expect, it } from 'vitest';
import { PILOT_TRAILS } from './pilot-trails';
import { seedPilotTrails, seedPilotTrailsIfEmpty } from './seed-trails';

describe('pilot trail lines', () => {
  it('keeps every line inside Southeast Alaska', () => {
    const slugs = new Set(PILOT_TRAILS.map((trail) => trail.slug));
    expect(slugs.size).toBe(PILOT_TRAILS.length);
    expect(PILOT_TRAILS.length).toBeGreaterThanOrEqual(8);
    for (const trail of PILOT_TRAILS) {
      expect(lineStringSchema.safeParse(trail.line).success).toBe(true);
      for (const [lng, lat] of trail.line.coordinates) {
        expect(lng).toBeGreaterThan(-140);
        expect(lng).toBeLessThan(-130);
        expect(lat).toBeGreaterThan(54);
        expect(lat).toBeLessThan(60);
      }
    }
  });
});

describe('pilot trail seed', () => {
  const prisma = new PrismaClient();
  const slugs = PILOT_TRAILS.map((trail) => trail.slug);

  afterAll(async () => {
    await prisma.trail.deleteMany({ where: { slug: { in: slugs } } });
    await prisma.$disconnect();
  });

  it('publishes the lines when the map is empty and does not add them twice', async () => {
    await prisma.trail.deleteMany({ where: { slug: { in: slugs } } });
    const other = await prisma.trail.count();
    if (other > 0) {
      expect(await seedPilotTrailsIfEmpty(prisma)).toBe(0);
      return;
    }
    const created = await seedPilotTrailsIfEmpty(prisma);
    expect(created).toBe(PILOT_TRAILS.length);
    expect(await seedPilotTrailsIfEmpty(prisma)).toBe(0);
    expect(await seedPilotTrails(prisma)).toBe(0);
    const rows = await prisma.trail.findMany({
      where: { slug: { in: slugs } },
      include: { assets: true, dataSteward: true, maintenanceOwner: true },
    });
    expect(rows).toHaveLength(PILOT_TRAILS.length);
    for (const row of rows) {
      expect(row.status).toBe('PUBLISHED');
      expect(row.visibility).toBe('PUBLIC');
      expect(row.assets).toHaveLength(1);
      expect(row.assets[0]?.kind).toBe('TRAILHEAD');
    }
    const sitka = rows.find((row) => row.slug === 'sitka-cross-trail');
    expect(sitka?.maintenanceOwner?.slug).toBe('sitka-trail-works');
    const drawn = await prisma.$queryRawUnsafe<Array<{ drawn: boolean }>>(
      `SELECT geom IS NOT NULL AS drawn FROM "Trail" WHERE slug = 'herbert-glacier-trail'`,
    );
    expect(drawn[0]?.drawn).toBe(true);
  });
});
