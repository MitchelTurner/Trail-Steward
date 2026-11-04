import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type { ServerEnv } from 'shared';
import { ENV } from './tokens';
import { redisOptions } from './tokens';

@Injectable()
export class RedisService extends Redis implements OnModuleDestroy {
  constructor(@Inject(ENV) env: ServerEnv) {
    super(redisOptions(env.REDIS_URL));
  }

  async onModuleDestroy(): Promise<void> {
    await this.quit();
  }
}
