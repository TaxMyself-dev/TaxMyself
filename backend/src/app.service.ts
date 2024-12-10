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

    const jsonFilePath = './src/finsite/finsiteData.json';

    // Save a copy of the old file
    await this.backupOldJsonFile(jsonFilePath);

    // Create a new JSON file
    await this.finsiteService.createFinsiteJsonFile(process.env.FINSITE_ID, process.env.FINSITE_KEY);
    
    // Calculate dates
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    
    // Format dates as "YYYY-MM-DD"
    const endDate = today.toISOString().split('T')[0];
    const startDate = threeDaysAgo.toISOString().split('T')[0];
 
    await this.transactionsService.getTransactionsFromFinsite(jsonFilePath, startDate, endDate);
  }


  private async backupOldJsonFile(filePath: string): Promise<void> {
    const backupDir = './src/finsite/backups';
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '_'); // Create a timestamp (e.g., 2024_12_08T000000)
    const backupFilePath = path.join(backupDir, `finsiteData_${timestamp}.json`);

    try {
      // Ensure the backup directory exists
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      // Check if the file exists
      if (fs.existsSync(filePath)) {
        // Copy the file to the backup directory
        fs.copyFileSync(filePath, backupFilePath);
        console.log(`Backup created: ${backupFilePath}`);
      } else {
        console.log(`No file found at ${filePath}, skipping backup.`);
      }
    } catch (error) {
      console.error(`Error while backing up file: ${error.message}`);
    }
  }


}
