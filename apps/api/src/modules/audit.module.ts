import { Controller, Get, Module, Query } from '@nestjs/common';
import { AuditListDto } from '../dto';
import { pageResult } from '../present';
import { PrismaService } from '../prisma.service';
import { Roles } from '../session';

@Controller('audit')
@Roles('ADMIN')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: AuditListDto) {
    const where = {
      entityType: query.entityType,
      entityId: query.entityId,
    };
    const [total, rows] = await Promise.all([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return pageResult(rows, total, query.page, query.pageSize);
  }
}

@Module({ controllers: [AuditController] })
export class AuditModule {}
