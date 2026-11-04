import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuditService } from '../audit.service';
import { IssueCreateDto, IssueListDto, IssueOwnerDto } from '../dto';
import { pageResult } from '../present';
import { PrismaService } from '../prisma.service';
import { CurrentUser, Roles, type SessionUser } from '../session';
import { LIMITS } from '../tokens';
import { ReviewModule } from './review.module';
import { ReviewService } from './review.service';

@Controller('issues')
export class IssuesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly review: ReviewService,
  ) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: LIMITS.issues, ttl: 60 * 60 * 1000 } })
  async create(@Body() body: IssueCreateDto) {
    if (body.fax && body.fax.trim()) return { ok: true };
    let trailId: string | null = null;
    if (body.trailSlug) {
      const trail = await this.prisma.trail.findFirst({
        where: { slug: body.trailSlug, status: 'PUBLISHED', visibility: 'PUBLIC' },
        select: { id: true },
      });
      if (!trail) throw new BadRequestException('That trail is not on the map.');
      trailId = trail.id;
    }
    await this.prisma.issue.create({
      data: {
        title: body.title,
        detail: body.detail,
        trailId,
      },
    });
    return { ok: true };
  }

  @Get()
  @Roles('EDITOR')
  async list(@Query() query: IssueListDto) {
    const where = query.status ? { status: query.status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.issue.count({ where }),
      this.prisma.issue.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          trail: { select: { slug: true, name: true } },
          ownerOrg: { select: { slug: true, name: true } },
        },
      }),
    ]);
    return pageResult(rows, total, query.page, query.pageSize);
  }

  @Post(':id/close')
  @Roles('EDITOR')
  async close(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const existing = await this.prisma.issue.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('That issue was not found.');
    await this.prisma.issue.update({ where: { id }, data: { status: 'CLOSED' } });
    await this.audit.record({
      actorId: user.id,
      action: 'update',
      entityType: 'issue',
      entityId: id,
      before: { status: existing.status },
      after: { status: 'CLOSED' },
    });
    return { id, status: 'CLOSED' as const };
  }

  @Post(':id/owner')
  @Roles('EDITOR')
  async assignOwner(
    @Param('id') id: string,
    @Body() body: IssueOwnerDto,
    @CurrentUser() user: SessionUser,
  ) {
    const existing = await this.prisma.issue.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('That issue was not found.');
    if (body.organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: body.organizationId },
        select: { id: true },
      });
      if (!org) throw new BadRequestException('That organization is not in the directory.');
    }
    await this.prisma.issue.update({
      where: { id },
      data: { ownerOrgId: body.organizationId },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'update',
      entityType: 'issue',
      entityId: id,
      before: { ownerOrgId: existing.ownerOrgId },
      after: { ownerOrgId: body.organizationId },
    });
    return { id, organizationId: body.organizationId };
  }

  @Post(':id/review')
  @Roles('EDITOR')
  @HttpCode(200)
  reviewNow(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    return this.review.markReviewed('issue', id, user);
  }
}

@Module({ imports: [ReviewModule], controllers: [IssuesController] })
export class IssuesModule {}
