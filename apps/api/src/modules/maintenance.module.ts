import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { COUNTER_KIND_LABELS } from 'shared';
import { AuditService } from '../audit.service';
import {
  ChangeRequestCreateDto,
  ChangeRequestListDto,
  ChangeRequestResolveDto,
  WorkdayPatchDto,
  WorkdayWriteDto,
} from '../dto';
import { blankToNull, pageResult } from '../present';
import { PrismaService } from '../prisma.service';
import { CurrentUser, Roles, type SessionUser } from '../session';
import { LIMITS } from '../tokens';
import { renderWorkListPdf } from './work-list-pdf';

function dayStamp(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDay(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

@Controller('maintenance')
export class MaintenanceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('board')
  @Roles('EDITOR')
  async board() {
    const trails = await this.prisma.trail.findMany({
      where: {
        OR: [
          { issues: { some: { status: 'OPEN' } } },
          { workdays: { some: { status: 'PLANNED' } } },
          { changeRequests: { some: { status: 'OPEN' } } },
        ],
      },
      orderBy: { name: 'asc' },
      include: {
        maintenanceOwner: { select: { slug: true, name: true } },
        issues: {
          where: { status: 'OPEN' },
          orderBy: { createdAt: 'desc' },
          include: { ownerOrg: { select: { name: true } } },
        },
        workdays: {
          where: { status: 'PLANNED' },
          orderBy: { workDate: 'asc' },
          include: { hostOrg: { select: { name: true } } },
        },
        changeRequests: { where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' } },
      },
    });
    return {
      trails: trails.map((trail) => ({
        slug: trail.slug,
        name: trail.name,
        maintenanceOwner: trail.maintenanceOwner,
        openIssues: trail.issues.map((issue) => ({
          id: issue.id,
          title: issue.title,
          ownerName: issue.ownerOrg?.name ?? null,
        })),
        plannedWorkdays: trail.workdays.map((day) => ({
          id: day.id,
          title: day.title,
          workDate: dayStamp(day.workDate),
          hostName: day.hostOrg?.name ?? null,
        })),
        openChangeRequests: trail.changeRequests.map((change) => ({
          id: change.id,
          message: change.message,
        })),
      })),
    };
  }
}

@Controller('trails/:slug/workdays')
export class WorkdaysController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @Roles('EDITOR')
  @HttpCode(201)
  async create(
    @Param('slug') slug: string,
    @Body() body: WorkdayWriteDto,
    @CurrentUser() user: SessionUser,
  ) {
    const trail = await this.trail(slug);
    await this.requireHost(body.hostOrgId);
    const day = await this.prisma.workday.create({
      data: {
        trailId: trail.id,
        title: body.title,
        notes: blankToNull(body.notes) ?? null,
        workDate: parseDay(body.workDate),
        status: body.status ?? 'PLANNED',
        hostOrgId: body.hostOrgId ?? null,
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'create',
      entityType: 'workday',
      entityId: day.id,
      after: { title: day.title, trailId: trail.id },
    });
    return { id: day.id, workDate: dayStamp(day.workDate) };
  }

  @Patch(':id')
  @Roles('EDITOR')
  async update(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() body: WorkdayPatchDto,
    @CurrentUser() user: SessionUser,
  ) {
    const trail = await this.trail(slug);
    const existing = await this.prisma.workday.findFirst({ where: { id, trailId: trail.id } });
    if (!existing) throw new NotFoundException('That work day is not on this trail.');
    await this.requireHost(body.hostOrgId);
    const day = await this.prisma.workday.update({
      where: { id },
      data: {
        title: body.title,
        notes: body.notes === undefined ? undefined : (blankToNull(body.notes) ?? null),
        workDate: body.workDate ? parseDay(body.workDate) : undefined,
        status: body.status,
        hostOrgId: body.hostOrgId,
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'update',
      entityType: 'workday',
      entityId: id,
      before: { status: existing.status },
      after: { status: day.status },
    });
    return { id: day.id, status: day.status, workDate: dayStamp(day.workDate) };
  }

  @Delete(':id')
  @Roles('EDITOR')
  @HttpCode(204)
  async remove(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ) {
    const trail = await this.trail(slug);
    const existing = await this.prisma.workday.findFirst({ where: { id, trailId: trail.id } });
    if (!existing) throw new NotFoundException('That work day is not on this trail.');
    await this.prisma.workday.delete({ where: { id } });
    await this.audit.record({
      actorId: user.id,
      action: 'delete',
      entityType: 'workday',
      entityId: id,
      before: { title: existing.title },
      after: null,
    });
  }

  private async trail(slug: string) {
    const trail = await this.prisma.trail.findUnique({ where: { slug }, select: { id: true } });
    if (!trail) throw new NotFoundException('That trail is not on the map.');
    return trail;
  }

  private async requireHost(hostOrgId: string | null | undefined) {
    if (!hostOrgId) return;
    const org = await this.prisma.organization.findUnique({
      where: { id: hostOrgId },
      select: { id: true },
    });
    if (!org) throw new BadRequestException('That organization is not in the directory.');
  }
}

@Controller('trails/:slug/change-requests')
export class ChangeRequestCreateController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: LIMITS.changeRequests, ttl: 60 * 60 * 1000 } })
  async create(@Param('slug') slug: string, @Body() body: ChangeRequestCreateDto) {
    if (body.fax && body.fax.trim()) return { ok: true };
    const trail = await this.prisma.trail.findFirst({
      where: { slug, status: 'PUBLISHED', visibility: 'PUBLIC' },
      select: { id: true },
    });
    if (!trail) throw new BadRequestException('That trail is not on the map.');
    await this.prisma.changeRequest.create({
      data: {
        trailId: trail.id,
        message: body.message,
        submitterName: blankToNull(body.submitterName) ?? null,
      },
    });
    return { ok: true };
  }
}

@Controller('change-requests')
export class ChangeRequestsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @Roles('EDITOR')
  async list(@Query() query: ChangeRequestListDto) {
    const where = query.status ? { status: query.status } : {};
    const [total, rows] = await Promise.all([
      this.prisma.changeRequest.count({ where }),
      this.prisma.changeRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { trail: { select: { slug: true, name: true } } },
      }),
    ]);
    return pageResult(rows, total, query.page, query.pageSize);
  }

  @Post(':id/resolve')
  @Roles('EDITOR')
  async resolve(
    @Param('id') id: string,
    @Body() body: ChangeRequestResolveDto,
    @CurrentUser() user: SessionUser,
  ) {
    const existing = await this.prisma.changeRequest.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('That map change was not found.');
    await this.prisma.changeRequest.update({
      where: { id },
      data: {
        status: body.status,
        resolutionNote: body.resolutionNote ?? null,
        resolvedById: user.id,
        resolvedAt: new Date(),
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'update',
      entityType: 'changeRequest',
      entityId: id,
      before: { status: existing.status },
      after: { status: body.status },
    });
    return { id, status: body.status };
  }
}

@Controller('trails/:slug')
export class WorkListController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get('packet')
  @Roles('EDITOR')
  @Throttle({ default: { limit: LIMITS.packet, ttl: 60 * 60 * 1000 } })
  @Header('Content-Type', 'application/pdf')
  async packet(
    @Param('slug') slug: string,
    @CurrentUser() user: SessionUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const trail = await this.prisma.trail.findUnique({
      where: { slug },
      include: {
        maintenanceOwner: { select: { name: true } },
        dataSteward: { select: { name: true } },
        issues: {
          where: { status: 'OPEN' },
          orderBy: { createdAt: 'desc' },
          include: { ownerOrg: { select: { name: true } } },
        },
        workdays: {
          where: { status: 'PLANNED' },
          orderBy: { workDate: 'asc' },
          include: { hostOrg: { select: { name: true } } },
        },
        changeRequests: { where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' } },
        counters: {
          orderBy: { name: 'asc' },
          include: {
            readings: { orderBy: [{ recordedOn: 'desc' }, { createdAt: 'desc' }], take: 1 },
          },
        },
      },
    });
    if (!trail) throw new NotFoundException('That trail is not on the map.');
    const generatedAt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Anchorage',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
    const buffer = await renderWorkListPdf({
      trailName: trail.name,
      generatedAt,
      maintenanceOwner: trail.maintenanceOwner?.name ?? 'No maintenance owner is named yet.',
      dataSteward: trail.dataSteward?.name ?? 'No data steward is named yet.',
      issues: trail.issues.map((issue) => ({
        title: issue.title,
        detail: issue.detail,
        owner: issue.ownerOrg?.name ?? 'No owner',
      })),
      workdays: trail.workdays.map((day) => ({
        workDate: formatDay(dayStamp(day.workDate)),
        title: day.title,
        host: day.hostOrg?.name ?? 'No host named',
        notes: day.notes ?? '',
      })),
      changes: trail.changeRequests.map((change) => ({ message: change.message })),
      counts: trail.counters.map((counter) => {
        const latest = counter.readings[0];
        const kind = COUNTER_KIND_LABELS[counter.kind];
        if (!latest) return { label: `${counter.name} (${kind}): no count yet` };
        return {
          label: `${counter.name} (${kind}): ${latest.count.toLocaleString('en-US')} visits recorded on ${formatDay(dayStamp(latest.recordedOn))}`,
        };
      }),
    });
    await this.audit.record({
      actorId: user.id,
      action: 'repair-packet.download',
      entityType: 'trail',
      entityId: trail.id,
      after: { slug },
    });
    res.setHeader('Content-Disposition', `attachment; filename="${slug}-work-list.pdf"`);
    return new StreamableFile(buffer);
  }
}

@Module({
  controllers: [
    MaintenanceController,
    WorkdaysController,
    ChangeRequestCreateController,
    ChangeRequestsController,
    WorkListController,
  ],
})
export class MaintenanceModule {}
