import { Prisma, type PrismaClient } from '@prisma/client';
import { PILOT_TRAILS } from './pilot-trails';

function alreadyStored(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

async function geometryColumn(prisma: PrismaClient): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ ok: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'Trail' AND column_name = 'geom'
     ) AS ok`,
  );
  return Boolean(rows[0]?.ok);
}

async function writeGeometry(
  prisma: PrismaClient,
  trailId: string,
  line: unknown,
  assetId: string,
  point: unknown,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "Trail"
    SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(line)}), 4326)::geometry(LineString, 4326)
    WHERE id = ${trailId}`;
  await prisma.$executeRaw`
    UPDATE "Asset"
    SET geom = ST_SetSRID(ST_GeomFromGeoJSON(${JSON.stringify(point)}), 4326)::geometry(Point, 4326)
    WHERE id = ${assetId}`;
}

export async function seedPilotTrails(prisma: PrismaClient): Promise<number> {
  const slugs = [
    ...new Set(
      PILOT_TRAILS.flatMap((trail) => [trail.dataStewardSlug, trail.maintenanceOwnerSlug]),
    ),
  ];
  const orgs = await prisma.organization.findMany({
    where: { slug: { in: slugs } },
    select: { id: true, slug: true },
  });
  const orgId = new Map(orgs.map((org) => [org.slug, org.id]));
  const geometry = await geometryColumn(prisma);
  let created = 0;
  for (const trail of PILOT_TRAILS) {
    const existing = await prisma.trail.findUnique({
      where: { slug: trail.slug },
      select: { id: true },
    });
    if (existing) continue;
    const point = { type: 'Point' as const, coordinates: trail.line.coordinates[0] };
    let row: { id: string; assets: { id: string }[] };
    try {
      row = await prisma.trail.create({
        data: {
          slug: trail.slug,
          name: trail.name,
          summary: trail.summary,
          status: 'PUBLISHED',
          visibility: 'PUBLIC',
          line: trail.line,
          dataStewardOrgId: orgId.get(trail.dataStewardSlug) ?? null,
          maintenanceOwnerOrgId: orgId.get(trail.maintenanceOwnerSlug) ?? null,
          assets: {
            create: {
              name: `${trail.name} trailhead`,
              kind: 'TRAILHEAD',
              point,
            },
          },
        },
        include: { assets: { select: { id: true } } },
      });
    } catch (error) {
      if (alreadyStored(error)) continue;
      throw error;
    }
    const asset = row.assets[0];
    if (geometry && asset) {
      try {
        await writeGeometry(prisma, row.id, trail.line, asset.id, point);
      } catch (error) {
        console.error(error instanceof Error ? error.message : error);
      }
    }
    created += 1;
  }
  return created;
}

export async function seedPilotTrailsIfEmpty(prisma: PrismaClient): Promise<number> {
  const count = await prisma.trail.count();
  if (count > 0) return 0;
  return seedPilotTrails(prisma);
}
