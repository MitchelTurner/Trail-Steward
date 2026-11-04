import { createHash, randomBytes } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Module,
  Post,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import type { ServerEnv } from 'shared';
import { MagicLinkDto, VerifyDto } from '../dto';
import { EmailService } from '../email.service';
import { PrismaService } from '../prisma.service';
import { CurrentUser, clearSessionCookie, setSessionCookie, type SessionUser } from '../session';
import { ENV, LIMITS } from '../tokens';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    @Inject(ENV) private readonly env: ServerEnv,
  ) {}

  @Post('magic-link')
  @HttpCode(204)
  @Throttle({ default: { limit: LIMITS.auth, ttl: 15 * 60 * 1000 } })
  async magicLink(@Body() body: MagicLinkDto): Promise<void> {
    const email = body.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) return;
    const raw = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(raw).digest('hex');
    await this.prisma.magicLinkToken.create({
      data: {
        email,
        tokenHash,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      },
    });
    const link = `${this.env.APP_BASE_URL}/auth/verify?token=${raw}`;
    await this.email.send({
      to: email,
      subject: 'Your Trail Steward sign-in link',
      text: `Use this link to sign in. It expires in 15 minutes and works once.\n\n${link}\n`,
    });
  }

  @Post('verify')
  @HttpCode(204)
  @Throttle({ default: { limit: LIMITS.auth, ttl: 15 * 60 * 1000 } })
  async verify(@Body() body: VerifyDto, @Res({ passthrough: true }) res: Response): Promise<void> {
    const tokenHash = createHash('sha256').update(body.token).digest('hex');
    const row = await this.prisma.magicLinkToken.findUnique({ where: { tokenHash } });
    if (!row) throw new UnauthorizedException('This sign-in link is not valid.');
    const used = await this.prisma.magicLinkToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) throw new UnauthorizedException('This sign-in link is not valid.');
    const user = await this.prisma.user.findUnique({ where: { email: row.email } });
    if (!user || !user.isActive) throw new UnauthorizedException('This sign-in link is not valid.');
    await this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      this.env.JWT_SECRET,
      {
        expiresIn: '7d',
      },
    );
    setSessionCookie(res, token);
  }

  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) res: Response): void {
    clearSessionCookie(res);
  }

  @Get('me')
  async me(@CurrentUser() user?: SessionUser) {
    if (!user) throw new UnauthorizedException();
    const full = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { organization: { select: { id: true, name: true, slug: true } } },
    });
    if (!full) throw new UnauthorizedException();
    return {
      id: full.id,
      email: full.email,
      name: full.name,
      role: full.role,
      organizationId: full.organizationId,
      organization: full.organization,
    };
  }
}

@Module({ controllers: [AuthController] })
export class AuthModule {}
