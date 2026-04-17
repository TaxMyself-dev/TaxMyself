import { Controller, Get, Post } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Root health check — answers Cloud Run liveness probes */
  @Get()
  healthCheck() {
    return { status: 'ok' };
  }

  @Post('daily-task')
  async triggerDailyTask(): Promise<void> {
    console.log('Cron endpoint triggered.');
    await this.appService.handleDailyTask();
  }


}