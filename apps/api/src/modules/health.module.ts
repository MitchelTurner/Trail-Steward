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
    let redisStatus: 'ok' | 'error' = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }
    try {
      const pong = await this.redis.ping();
      redisStatus = pong === 'PONG' ? 'ok' : 'error';
    } catch {
      redisStatus = 'error';
    }
    const status = db === 'ok' && redisStatus === 'ok' ? 'ok' : 'error';
    res.status(status === 'ok' ? 200 : 503);
    return { status, db, redis: redisStatus };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
