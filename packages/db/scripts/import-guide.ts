import { PrismaClient } from '@prisma/client';
import { formatSummary, importGuideFromFile } from '../src/import/run-import';

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: pnpm --filter db import:guide <path-to.xlsx>');
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const summary = await importGuideFromFile(prisma, file);
    console.log(formatSummary(summary));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
