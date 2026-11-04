import { Inject, Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import type { ServerEnv } from 'shared';
import { ENV } from './tokens';

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; content: Buffer }[];
};

@Injectable()
export class EmailService {
  static sent: OutboundEmail[] = [];
  private readonly logger = new Logger(EmailService.name);

  constructor(@Inject(ENV) private readonly env: ServerEnv) {}

  async send(message: OutboundEmail): Promise<void> {
    if (process.env.NODE_ENV === 'test' || this.env.RESEND_API_KEY.startsWith('re_test')) {
      EmailService.sent.push(message);
      return;
    }
    try {
      const resend = new Resend(this.env.RESEND_API_KEY);
      await resend.emails.send({
        from: this.env.EMAIL_FROM,
        to: message.to,
        subject: message.subject,
        text: message.text,
        attachments: message.attachments?.map((file) => ({
          filename: file.filename,
          content: file.content,
        })),
      });
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : 'email send failed');
    }
  }
}
