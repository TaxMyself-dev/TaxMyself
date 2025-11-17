import { Controller, Get, Post} from '@nestjs/common';
import { AppService } from './app.service';
import axios from 'axios';

@Controller('cron')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('daily-task')
  async triggerDailyTask(): Promise<void> {
    console.log('Cron endpoint triggered.');
    await this.appService.handleDailyTask();
  }

  @Get('getIP')
  async getExternalIP(): Promise<{ data: any }> {
    
    
      try {
        const { data } = await
          axios.get('https://api.bigdatacloud.net/data/client-info')
        
    
        console.log('===========================================');
        console.log('🚀 External IP detected:', data.ipString);
        console.log('===========================================');
        return {data };
    
        // You can add:
        // - save to DB
        // - email yourself
        // - send to Slack
      } catch (err) {
        console.error('❌ Failed to fetch external IP:', err.message);
      }
    return { data: 'Unable to fetch IP' };
  }
  
}