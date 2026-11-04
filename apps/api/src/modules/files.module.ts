import { FileInterceptor } from '@nestjs/platform-express';
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
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuditService } from '../audit.service';
import { PrismaService } from '../prisma.service';
import { CurrentUser, Roles, type SessionUser } from '../session';

const MAX_BYTES = 5 * 1024 * 1024;

type Upload = { originalname?: string; buffer?: Buffer };

function sniff(bytes: Buffer): 'application/pdf' | 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (bytes.length >= 4 && bytes.subarray(0, 4).toString('utf8') === '%PDF') return 'application/pdf';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('utf8') === 'RIFF' &&
    bytes.subarray(8, 12).toString('utf8') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function cleanName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'file';
  const cleaned = base.replace(/[^\w.\- ()]+/g, '').trim().slice(0, 180);
  return cleaned || 'file';
}

@Controller('trails/:slug/files')
export class TrailFilesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @Roles('EDITOR')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async upload(
    @Param('slug') slug: string,
    @UploadedFile() file: Upload | undefined,
    @Body() body: { visibility?: string },
    @CurrentUser() user: SessionUser,
  ) {
    if (!file?.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Choose a PDF or a photo.');
    }
    const contentType = sniff(file.buffer);
    if (!contentType) {
      throw new BadRequestException('Upload a PDF or a photo (PNG, JPEG, or WebP).');
    }
    const trail = await this.prisma.trail.findUnique({ where: { slug }, select: { id: true } });
    if (!trail) throw new NotFoundException('That trail is not on the map.');
    const saved = await this.prisma.trailFile.create({
      data: {
        trailId: trail.id,
        name: cleanName(file.originalname ?? 'file'),
        contentType,
        bytes: file.buffer,
        visibility: body.visibility === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE',
        uploadedById: user.id,
      },
    });
    await this.audit.record({
      actorId: user.id,
      action: 'create',
      entityType: 'trailFile',
      entityId: saved.id,
      after: { name: saved.name, contentType, visibility: saved.visibility },
    });
    return { id: saved.id, name: saved.name, visibility: saved.visibility };
  }

  @Delete(':id')
  @Roles('EDITOR')
  @HttpCode(204)
  async remove(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUser() user: SessionUser,
  ) {
    const trail = await this.prisma.trail.findUnique({ where: { slug }, select: { id: true } });
    if (!trail) throw new NotFoundException('That trail is not on the map.');
    const existing = await this.prisma.trailFile.findFirst({
      where: { id, trailId: trail.id },
      select: { id: true, name: true },
    });
    if (!existing) throw new NotFoundException('That file is not on this trail.');
    await this.prisma.trailFile.delete({ where: { id } });
    await this.audit.record({
      actorId: user.id,
      action: 'delete',
      entityType: 'trailFile',
      entityId: id,
      before: { name: existing.name },
      after: null,
    });
  }
}

@Controller('files')
export class FileDownloadController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(
    @Param('id') id: string,
    @CurrentUser() user: SessionUser | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.prisma.trailFile.findUnique({
      where: { id },
      include: { trail: { select: { status: true, visibility: true } } },
    });
    if (!file) throw new NotFoundException('That file is not available.');
    const published = file.trail.status === 'PUBLISHED' && file.trail.visibility === 'PUBLIC';
    const isPublic = file.visibility === 'PUBLIC' && published;
    if (!isPublic && !user) throw new NotFoundException('That file is not available.');
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${cleanName(file.name)}"`);
    return new StreamableFile(Buffer.from(file.bytes));
  }
}

@Module({ controllers: [TrailFilesController, FileDownloadController] })
export class FilesModule {}
