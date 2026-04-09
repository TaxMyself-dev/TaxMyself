import { Controller, Get, Post} from '@nestjs/common';
import { AppService } from './app.service';
import axios from 'axios';

@Controller('cron')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  healthCheck() {
    console.log('Health check endpoint triggered.');
    return { status: 'ok' };
  }

  @Post('daily-task')
  async triggerDailyTask(): Promise<void> {
    console.log('Cron endpoint triggered.');
    await this.appService.handleDailyTask();
  }


}