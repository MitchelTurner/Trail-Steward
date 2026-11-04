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
  Res,
  StreamableFile,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { COUNTER_KIND_LABELS, PACKET_STATUS_LABELS } from 'shared';
import { AuditService } from '../audit.service';
import { EmailService } from '../email.service';
import { PacketPatchDto, PacketSendDto, PacketWriteDto } from '../dto';
import { PrismaService } from '../prisma.service';
import { CurrentUser, Roles, type SessionUser } from '../session';
import { LIMITS } from '../tokens';
import { renderWorkListPdf } from './work-list-pdf';

function unique(ids: string[] | undefined): string[] {
  return [...new Set(ids ?? [])];
}

function dayStamp(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatDay(stamp: string): string {
  const [year, month, day] = stamp.split('-').map(Number);
  if (!year || !month || !day) return stamp;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function present(packet: {
  id: string;
  title: string;
  notes: string;
  status: 'DRAFT' | 'READY' | 'DONE';
  issueIds: string[];
  workdayIds: string[];
  fileIds: string[];
  sentAt: Date | null;
  sentTo: string | null;
}) {
  return {
    id: packet.id,
    title: packet.title,
    notes: packet.notes,
    status: packet.status,
    issueIds: packet.issueIds,
    workdayIds: packet.workdayIds,
    fileIds: packet.fileIds,
    sentAt: packet.sentAt?.toISOString() ?? null,
    sentTo: packet.sentTo,
  };
}

async function ownedIds(
  prisma: PrismaService,
  trailId: string,
  issueIds: string[],
  workdayIds: string[],
  fileIds: string[],
): Promise<void> {
  const [issues, days, files] = await Promise.all([
    issueIds.length ? prisma.issue.count({ where: { trailId, id: { in: issueIds } } }) : 0,
    workdayIds.length ? prisma.workday.count({ where: { trailId, id: { in: workdayIds } } }) : 0,
    fileIds.length ? prisma.trailFile.count({ where: { trailId, id: { in: fileIds } } }) : 0,
  ]);
  if (issues !== issueIds.length || days !== workdayIds.length || files !== fileIds.length) {
    throw new BadRequestException('That item is not on this trail.');
  }
}

@Controller('trails/:slug/packets')
export class TrailPacketsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @Roles('EDITOR')
  @HttpCode(201)
  async create(
    @Param('slug') slug: string,
    @Body() body: PacketWriteDto,
    @CurrentUser() user: SessionUser,
  ) {
    const trail = await this.prisma.trail.findUnique({ where: { slug }, select: { id: true } });
    if (!trail) throw new NotFoundException('That trail is not on the map.');
    const issueIds = unique(body.issueIds);
    const workdayIds = unique(body.workdayIds);
    const fileIds = unique(body.fileIds);
    await ownedIds(this.prisma, trail.id, issueIds, workdayIds, fileIds);
    const packet = await this.prisma.repairPacket.create({
      data: {
        trailId: trail.id,
        title: body.title,
        notes: body.notes ?? '',
        status: body.status ?? 'DRAFT',
        issueIds,
        workdayIds,
        fileIds,
        createdById: user.id,
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'create',
      entityType: 'repairPacket',
      entityId: packet.id,
      after: { title: packet.title, status: packet.status },
    });
    return present(packet);
  }
}

async function loadPacketPdf(prisma: PrismaService, id: string) {
  const packet = await prisma.repairPacket.findUnique({
    where: { id },
    include: {
      trail: {
        include: {
          maintenanceOwner: { select: { name: true } },
          dataSteward: { select: { name: true } },
          counters: {
            orderBy: { name: 'asc' },
            include: {
              readings: { orderBy: [{ recordedOn: 'desc' }, { createdAt: 'desc' }], take: 1 },
            },
          },
        },
      },
    },
  });
  if (!packet) return null;
  const [issues, workdays, files] = await Promise.all([
    packet.issueIds.length
      ? prisma.issue.findMany({
          where: { trailId: packet.trailId, id: { in: packet.issueIds } },
          include: { ownerOrg: { select: { name: true } } },
        })
      : [],
    packet.workdayIds.length
      ? prisma.workday.findMany({
          where: { trailId: packet.trailId, id: { in: packet.workdayIds } },
          include: { hostOrg: { select: { name: true } } },
        })
      : [],
    packet.fileIds.length
      ? prisma.trailFile.findMany({
          where: { trailId: packet.trailId, id: { in: packet.fileIds } },
          select: { id: true, name: true },
        })
      : [],
  ]);
  const issueById = new Map(issues.map((issue) => [issue.id, issue]));
  const dayById = new Map(workdays.map((day) => [day.id, day]));
  const fileById = new Map(files.map((file) => [file.id, file]));
  const generatedAt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Anchorage',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date());
  const buffer = await renderWorkListPdf({
    trailName: packet.trail.name,
    documentTitle: packet.title,
    notes: packet.notes,
    saved: true,
    generatedAt,
    maintenanceOwner: packet.trail.maintenanceOwner?.name ?? 'No maintenance owner is named yet.',
    dataSteward: packet.trail.dataSteward?.name ?? 'No data steward is named yet.',
    issues: packet.issueIds.flatMap((issueId) => {
      const issue = issueById.get(issueId);
      if (!issue) return [];
      return [
        {
          title: issue.title,
          detail: issue.detail,
          owner: issue.ownerOrg?.name ?? 'No owner',
        },
      ];
    }),
    workdays: packet.workdayIds.flatMap((dayId) => {
      const day = dayById.get(dayId);
      if (!day) return [];
      return [
        {
          workDate: formatDay(dayStamp(day.workDate)),
          title: day.title,
          host: day.hostOrg?.name ?? 'No host named',
          notes: day.notes ?? '',
        },
      ];
    }),
    files: packet.fileIds.flatMap((fileId) => {
      const file = fileById.get(fileId);
      return file ? [{ name: file.name }] : [];
    }),
    changes: [],
    counts: packet.trail.counters.map((counter) => {
      const latest = counter.readings[0];
      const kind = COUNTER_KIND_LABELS[counter.kind];
      if (!latest) return { label: `${counter.name} (${kind}): no count yet` };
      return {
        label: `${counter.name} (${kind}): ${latest.count.toLocaleString('en-US')} visits recorded on ${formatDay(dayStamp(latest.recordedOn))}`,
      };
    }),
  });
  const slug = packet.trail.slug.replace(/[^a-z0-9-]+/gi, '');
  return { packet, buffer, filename: `${slug || 'trail'}-work-packet.pdf` };
}

@Controller('packets')
export class PacketsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly email: EmailService,
  ) {}

  @Patch(':id')
  @Roles('EDITOR')
  async update(@Param('id') id: string, @Body() body: PacketPatchDto, @CurrentUser() user: SessionUser) {
    const existing = await this.prisma.repairPacket.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('That work packet is not here.');
    const issueIds = body.issueIds === undefined ? existing.issueIds : unique(body.issueIds);
    const workdayIds = body.workdayIds === undefined ? existing.workdayIds : unique(body.workdayIds);
    const fileIds = body.fileIds === undefined ? existing.fileIds : unique(body.fileIds);
    if (body.issueIds !== undefined || body.workdayIds !== undefined || body.fileIds !== undefined) {
      await ownedIds(this.prisma, existing.trailId, issueIds, workdayIds, fileIds);
    }
    const packet = await this.prisma.repairPacket.update({
      where: { id },
      data: {
        ...(body.title === undefined ? {} : { title: body.title }),
        ...(body.notes === undefined ? {} : { notes: body.notes }),
        ...(body.status === undefined ? {} : { status: body.status }),
        ...(body.issueIds === undefined ? {} : { issueIds }),
        ...(body.workdayIds === undefined ? {} : { workdayIds }),
        ...(body.fileIds === undefined ? {} : { fileIds }),
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'update',
      entityType: 'repairPacket',
      entityId: packet.id,
      before: { status: existing.status, title: existing.title },
      after: { status: packet.status, title: packet.title },
    });
    return present(packet);
  }

  @Delete(':id')
  @Roles('EDITOR')
  @HttpCode(204)
  async remove(@Param('id') id: string, @CurrentUser() user: SessionUser) {
    const existing = await this.prisma.repairPacket.findUnique({ where: { id }, select: { id: true, title: true } });
    if (!existing) throw new NotFoundException('That work packet is not here.');
    await this.prisma.repairPacket.delete({ where: { id } });
    await this.audit.record({
      actorId: user.id,
      action: 'delete',
      entityType: 'repairPacket',
      entityId: id,
      before: { title: existing.title },
    });
  }

  @Post(':id/send')
  @Roles('EDITOR')
  @HttpCode(200)
  @Throttle({ default: { limit: LIMITS.packet, ttl: 60 * 60 * 1000 } })
  async send(
    @Param('id') id: string,
    @Body() body: PacketSendDto,
    @CurrentUser() user: SessionUser,
  ) {
    const loaded = await loadPacketPdf(this.prisma, id);
    if (!loaded) throw new NotFoundException('That work packet is not here.');
    const sentAt = new Date();
    await this.email.send({
      to: body.to,
      subject: `Work packet: ${loaded.packet.title}`,
      text: [
        `A work packet for ${loaded.packet.trail.name} is attached.`,
        '',
        loaded.packet.title,
        loaded.packet.notes,
        '',
        'This is the set that was saved. It is not everything open on the trail today.',
      ].join('\n'),
      attachments: [{ filename: loaded.filename, content: loaded.buffer }],
    });
    const packet = await this.prisma.repairPacket.update({
      where: { id },
      data: { sentAt, sentTo: body.to },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'repair-packet.send',
      entityType: 'repairPacket',
      entityId: packet.id,
      after: { sentTo: body.to, title: packet.title },
    });
    return present(packet);
  }

  @Get(':id/pdf')
  @Roles('EDITOR')
  @Throttle({ default: { limit: LIMITS.packet, ttl: 60 * 60 * 1000 } })
  @Header('Content-Type', 'application/pdf')
  async pdf(@Param('id') id: string, @CurrentUser() user: SessionUser, @Res({ passthrough: true }) res: Response) {
    const loaded = await loadPacketPdf(this.prisma, id);
    if (!loaded) throw new NotFoundException('That work packet is not here.');
    await this.audit.record({
      actorId: user.id,
      action: 'repair-packet.download',
      entityType: 'repairPacket',
      entityId: loaded.packet.id,
      after: { title: loaded.packet.title, status: PACKET_STATUS_LABELS[loaded.packet.status] },
    });
    res.setHeader('Content-Disposition', `attachment; filename="${loaded.filename}"`);
    return new StreamableFile(loaded.buffer);
  }
}

@Module({ controllers: [TrailPacketsController, PacketsController] })
export class PacketsModule {}
