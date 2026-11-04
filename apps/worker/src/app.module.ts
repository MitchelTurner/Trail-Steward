import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
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
  ],
})
export class AppModule {}
