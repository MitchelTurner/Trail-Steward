import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { findRepoRoot, importGuideFromFile, seedPathways, writeFixtureFile } from '../src/index';

/**
 * Local demo data. The product seed (`seed:pathways`) leaves the pathway as DRAFT.
 * This script publishes it so the public intake can be tried.
 */
async function main(): Promise<void> {
  const root = findRepoRoot(process.cwd());
  const file = path.join(root, 'data', 'SEC_Trail_Coordination_Guide_Draft_V2.xlsx');
  if (!fs.existsSync(file)) await writeFixtureFile(file);
  const prisma = new PrismaClient();
  try {
    const summary = await importGuideFromFile(prisma, file);
    await seedPathways(prisma, root);
    await prisma.pathway.update({
      where: { slug: 'funding-application' },
      data: { status: 'PUBLISHED' },
    });
    console.log(
      `Pilot data ready. Warnings: ${summary.warnings.length}. Pathway funding-application is published.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
