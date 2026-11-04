import { Injectable } from '@nestjs/common';
import { Prisma } from 'db';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: {
    actorId?: string | null;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
  }): Promise<void> {
    const diff =
      entry.before === undefined && entry.after === undefined
        ? undefined
        : ({
            before: entry.before ?? null,
            after: entry.after ?? null,
          } as Prisma.InputJsonValue);
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        diff,
      },
    });
  }
}
