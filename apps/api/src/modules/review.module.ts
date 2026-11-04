import { Controller, Get, Module } from '@nestjs/common';
import { Roles } from '../session';
import { ReviewService } from './review.service';

@Controller('review')
export class ReviewController {
  constructor(private readonly review: ReviewService) {}

  @Get('dashboard')
  @Roles('COORDINATOR')
  dashboard() {
    return this.review.dashboard();
  }
}

@Module({
  controllers: [ReviewController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
