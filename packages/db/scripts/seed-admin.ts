import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if (!email) {
    console.log('Set ADMIN_EMAIL to create the first admin. No user was created.');
    return;
  }
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { email },
      update: { role: 'ADMIN', isActive: true, name: process.env.ADMIN_NAME?.trim() || undefined },
      create: {
        email,
        role: 'ADMIN',
        name: process.env.ADMIN_NAME?.trim() || 'Administrator',
        isActive: true,
      },
    });
    console.log(`Admin ready: ${user.email}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
