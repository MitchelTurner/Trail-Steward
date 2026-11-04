import { Controller, Get, Module, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { RedisService } from '../redis.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Get()
  async health(@Res({ passthrough: true }) res: Response) {
    let db: 'ok' | 'error' = 'ok';
    let dbReason: string | undefined;
    let redisStatus: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (error) {
      db = 'error';
      dbReason = databaseProblem(error);
      console.error(`Database check failed: ${dbReason}`);
    }
    try {
      const pong = await this.redis.ping();
      redisStatus = pong === 'PONG' ? 'ok' : 'error';
    } catch {
      redisStatus = 'error';
    }
    const status = db === 'ok' && redisStatus === 'ok' ? 'ok' : 'error';
    res.status(status === 'ok' ? 200 : 503);
    return { status, db, redis: redisStatus, ...(dbReason ? { dbReason } : {}) };
  }
}

function databaseProblem(error: unknown): string {
  const code =
    error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : '';
  const message = error instanceof Error ? error.message : 'Database query failed';
  const clean = message
    .replace(/postgres(?:ql)?:\/\/\S+/gi, 'postgresql://redacted')
    .replace(/\s+/g, ' ')
    .slice(0, 180);
  return code ? `${code}: ${clean}` : clean;
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
