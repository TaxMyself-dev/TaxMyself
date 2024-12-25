import { Controller, Post} from '@nestjs/common';
import { AppService } from './app.service';

@Controller('cron')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('daily-task')
  async triggerDailyTask(): Promise<void> {
    console.log('Cron endpoint triggered.');
    await this.appService.handleDailyTask();
  }
  
}