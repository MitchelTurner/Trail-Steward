import { ConflictException } from '@nestjs/common';
import { Prisma } from 'db';

export function rethrowPrisma(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException('That record already exists.');
  }
  throw error;
}
