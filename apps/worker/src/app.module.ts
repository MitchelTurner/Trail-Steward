import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaClient } from 'db';
import { loadServerEnv, type ServerEnv } from 'shared';
import { EmailService } from './email.service';
import {
  ChecklistCleanupProcessor,
  ImportGuideProcessor,
  LinkCheckProcessor,
  ReviewReminderProcessor,
} from './jobs';
import { redisOptions } from './redis';
import { ScheduleService } from './schedule';
import { ENV } from './tokens';

const QUEUES = ['link-check', 'review-reminders', 'checklist-cleanup', 'import-guide'] as const;

@Injectable()
class QueueErrorLog implements OnModuleInit {
  constructor(
    @InjectQueue('link-check') private readonly links: Queue,
    @InjectQueue('review-reminders') private readonly reminders: Queue,
    @InjectQueue('checklist-cleanup') private readonly cleanup: Queue,
    @InjectQueue('import-guide') private readonly imports: Queue,
  ) {}

  onModuleInit(): void {
    for (const queue of [this.links, this.reminders, this.cleanup, this.imports]) {
      queue.on('error', (error: Error) => {
        console.error(`Redis queue error: ${error.message}`);
      });
    }
  }
}

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadServerEnv() },
    {
      provide: PrismaClient,
      useFactory: (env: ServerEnv) =>
        new PrismaClient({ datasources: { db: { url: env.DATABASE_URL } } }),
      inject: [ENV],
    },
    EmailService,
  ],
  exports: [ENV, PrismaClient, EmailService],
})
class CoreModule {}

@Module({
  imports: [
    CoreModule,
    BullModule.forRootAsync({
      imports: [CoreModule],
      inject: [ENV],
      useFactory: (env: ServerEnv) => ({ connection: redisOptions(env.REDIS_URL) }),
    }),
    BullModule.registerQueue(...QUEUES.map((name) => ({ name }))),
  ],
  providers: [
    LinkCheckProcessor,
    ReviewReminderProcessor,
    ChecklistCleanupProcessor,
    ImportGuideProcessor,
    ScheduleService,
    QueueErrorLog,
  ],
})
export class AppModule {}
