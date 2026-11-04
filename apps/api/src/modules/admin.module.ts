import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { BullModule } from '@nestjs/bullmq';
import {
  BadRequestException,
  Controller,
  Get,
  Module,
  NotFoundException,
  OnModuleInit,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Roles } from '../session';
import { ReviewModule } from './review.module';
import { ReviewService } from './review.service';

export const IMPORT_QUEUE = 'import-guide';

@Controller('admin')
@Roles('ADMIN')
export class AdminController implements OnModuleInit {
  constructor(
    @InjectQueue(IMPORT_QUEUE) private readonly imports: Queue,
    private readonly review: ReviewService,
  ) {}

  onModuleInit(): void {
    this.imports.on('error', (error: Error) => {
      console.error(`Redis queue error: ${error.message}`);
    });
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 15 * 1024 * 1024 } }))
  async importGuide(@UploadedFile() file?: { originalname?: string; buffer?: Buffer }) {
    if (!file?.buffer || file.buffer.length === 0)
      throw new BadRequestException('Choose an .xlsx file.');
    const name = file.originalname ?? 'guide.xlsx';
    if (!name.toLowerCase().endsWith('.xlsx'))
      throw new BadRequestException('The file must be an .xlsx workbook.');
    // The import workbook still travels in the job. Trail files are a separate store.
    const job = await this.imports.add('import', {
      filename: name,
      contentBase64: file.buffer.toString('base64'),
    });
    return { id: job.id };
  }

  @Get('jobs/:id')
  async job(@Param('id') id: string) {
    const job = await this.imports.getJob(id);
    if (!job) throw new NotFoundException('Job not found.');
    return {
      id: job.id,
      state: await job.getState(),
      progress: job.progress,
      result: job.returnvalue ?? null,
      failedReason: job.failedReason || null,
    };
  }

  @Get('metrics')
  metrics() {
    return this.review.metrics();
  }
}

@Module({
  imports: [BullModule.registerQueue({ name: IMPORT_QUEUE }), ReviewModule],
  controllers: [AdminController],
})
export class AdminModule {}
