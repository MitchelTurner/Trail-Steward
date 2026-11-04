import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PrismaClient, findRepoRoot, importGuideFromFile, seedPathways, writeFixtureFile } from 'db';

function schemaDir(): string {
  const candidates = [
    join(process.cwd(), 'packages/db'),
    join(process.cwd(), '../../packages/db'),
    join(__dirname, '../../../packages/db'),
  ];
  const found = candidates.find((dir) => existsSync(join(dir, 'prisma/schema.prisma')));
  if (!found) throw new Error('Could not find the Prisma schema.');
  return found;
}

function prismaCli(start: string): string | undefined {
  let dir = start;
  for (let i = 0; i < 6; i += 1) {
    const candidate = join(dir, 'node_modules/prisma/build/index.js');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

async function clearFailedMigrations(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
      `SELECT EXISTS (
         SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
       ) AS "exists"`,
    );
    if (!rows[0]?.exists) return;
    await prisma.$executeRawUnsafe(
      `DELETE FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL`,
    );
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect();
  }
}

export async function migrateDatabase(): Promise<void> {
  const dbDir = schemaDir();
  const cli = prismaCli(dbDir) ?? prismaCli(process.cwd()) ?? prismaCli(__dirname);
  if (!cli) throw new Error('Could not find the Prisma CLI.');
  await clearFailedMigrations();
  execFileSync(process.execPath, [cli, 'migrate', 'deploy'], {
    cwd: dbDir,
    stdio: 'inherit',
    env: process.env,
  });
}

export async function seedTopicsIfEmpty(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const count = await prisma.topic.count();
    if (count > 0) return;
    const root = findRepoRoot(process.cwd());
    const file = join(root, 'data', 'SEC_Trail_Coordination_Guide_Draft_V2.xlsx');
    if (!existsSync(file)) await writeFixtureFile(file);
    const summary = await importGuideFromFile(prisma, file);
    await seedPathways(prisma, root);
    await prisma.pathway.update({
      where: { slug: 'funding-application' },
      data: { status: 'PUBLISHED' },
    });
    console.log(
      `Loaded the directory because no topics were stored. Warnings: ${summary.warnings.length}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
