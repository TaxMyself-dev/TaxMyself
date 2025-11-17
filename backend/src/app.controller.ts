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
  async getExternalIP(
    body: any,
  ): Promise<{ data: any }> {
    
    //get the api url as a url param and fetch the data from there
    
    
    try {
      const data1 = await axios.get('https://cloudflare.com/cdn-cgi/trace');
       const ipMatch = data1.data.match(/ip=([^\n]+)/);
        if (ipMatch && ipMatch[1]) {
          const ipAddress = ipMatch[1];
          console.log('===========================================');
          console.log('🚀 External IP detected via Cloudflare:', ipAddress);
          console.log('===========================================');
          return { data: ipAddress };
        }
    } catch (error) {
      console.log('Failed to fetch from Cloudflare:', error.message);
    }

    try {
      const data0 = await axios.get('https://api.ipify.org?format=json');
      console.log('===========================================');
      console.log('🚀 External IP detected via ipify:', data0.data.ip);
      console.log('===========================================');
      return { data: data0.data.ip };
      
    } catch (error) {
      console.log('Failed to fetch from ipify:', error.message);
    }

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