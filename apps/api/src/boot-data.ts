import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
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

export function migrateDatabase(): void {
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: schemaDir(),
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
