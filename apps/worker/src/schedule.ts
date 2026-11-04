import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';

const ZONE = 'America/Anchorage';

@Injectable()
export class ScheduleService implements OnModuleInit {
  constructor(
    @InjectQueue('link-check') private readonly links: Queue,
    @InjectQueue('review-reminders') private readonly reminders: Queue,
    @InjectQueue('checklist-cleanup') private readonly cleanup: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') return;
    await this.links.upsertJobScheduler(
      'link-check-weekly',
      { pattern: '0 3 * * 1', tz: ZONE },
      { name: 'run' },
    );
    await this.reminders.upsertJobScheduler(
      'review-reminders-weekly',
      { pattern: '0 8 * * 1', tz: ZONE },
      { name: 'run' },
    );
    await this.cleanup.upsertJobScheduler(
      'checklist-cleanup-monthly',
      { pattern: '0 4 1 * *', tz: ZONE },
      { name: 'run' },
    );
  }
}

export const SCHEDULE_ZONE = ZONE;
