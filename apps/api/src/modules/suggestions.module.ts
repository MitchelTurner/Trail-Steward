import {
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
import { SuggestionCreateDto, SuggestionListDto, SuggestionResolveDto } from '../dto';
import { pageResult } from '../present';
import { PrismaService } from '../prisma.service';
import { AuditService } from '../audit.service';
import { CurrentUser, Roles, type SessionUser } from '../session';
import { LIMITS } from '../tokens';

@Controller('suggestions')
export class SuggestionsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: LIMITS.suggestions, ttl: 60 * 60 * 1000 } })
  async create(@Body() body: SuggestionCreateDto) {
    if (body.fax && body.fax.trim()) return { ok: true };
    await this.prisma.suggestion.create({
      data: {
        targetType: body.targetType,
        targetId: body.targetId,
        message: body.message,
        proposedUrl: body.proposedUrl || null,
        submitterName: body.submitterName || null,
        submitterEmail: body.submitterEmail || null,
      },
    });
    return { ok: true };
  }

  @Get()
  @Roles('EDITOR')
  async list(@Query() query: SuggestionListDto) {
    const where = query.status ? { status: query.status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.suggestion.count({ where }),
      this.prisma.suggestion.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { resolvedBy: { select: { id: true, name: true } } },
      }),
    ]);
    return pageResult(rows, total, query.page, query.pageSize);
  }

  @Post(':id/resolve')
  @Roles('EDITOR')
  async resolve(
    @Param('id') id: string,
    @Body() body: SuggestionResolveDto,
    @CurrentUser() user: SessionUser,
  ) {
    const existing = await this.prisma.suggestion.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Suggestion not found.');
    const updated = await this.prisma.suggestion.update({
      where: { id },
      data: {
        status: body.status,
        resolutionNote: body.resolutionNote ?? null,
        resolvedById: user.id,
        resolvedAt: existing.resolvedAt ?? new Date(),
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'suggestion.resolve',
      entityType: 'suggestion',
      entityId: id,
      before: { status: existing.status },
      after: { status: updated.status, resolutionNote: updated.resolutionNote },
    });
    return updated;
  }
}

@Module({ controllers: [SuggestionsController] })
export class SuggestionsModule {}
