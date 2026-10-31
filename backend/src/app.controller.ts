import { Controller, Get, Header, Post } from '@nestjs/common';
import { AppService } from './app.service';
import { ReadinessService } from './readiness.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly readinessService: ReadinessService,
  ) {}

  /** Root health check — answers Cloud Run liveness probes */
  @Get()
  healthCheck() {
    return { status: 'ok' };
  }

  /** Deployment gate: verifies production DB identity and signup schema. */
  @Get('ready')
  @Header('Cache-Control', 'no-store')
  readinessCheck() {
    return this.readinessService.check();
  }

  @Post('daily-task')
  async triggerDailyTask(): Promise<void> {
    console.log('Cron endpoint triggered.');
    await this.appService.handleDailyTask();
  }
}
