import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import * as fs from 'fs';
import * as path from 'path';
import { TransactionsService } from './transactions/transactions.service';
import { FinsiteService } from './finsite/finsite.service';


@Injectable()
export class AppService {

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly finsiteService: FinsiteService,
  ) {}
  //     min  hr  day  mon  dayOfWeek
  @Cron('0   0   *    *   *') // Runs daily at midnight
  async handleDailyTask() {

    console.log('Running daily task');

    // Create a new JSON file
    await this.finsiteService.getFinsiteBills(process.env.FINSITE_ID, process.env.FINSITE_KEY);
    
    // Calculate dates
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    
    // Format dates as "YYYY-MM-DD"
    const endDate = today.toISOString().split('T')[0];
    const startDate = threeDaysAgo.toISOString().split('T')[0];
 
    await this.transactionsService.getTransactionsFromFinsite(startDate, endDate);
  }

}
