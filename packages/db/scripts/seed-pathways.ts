import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { findRepoRoot } from '../src/pathways/seed';
import { seedPathways } from '../src/pathways/seed';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const root = findRepoRoot(path.resolve(__dirname, '../../..'));
    await seedPathways(prisma, root);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
