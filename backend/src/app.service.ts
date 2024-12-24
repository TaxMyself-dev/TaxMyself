import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
//import * as fs from 'fs';
//import * as path from 'path';
import { TransactionsService } from './transactions/transactions.service';
import { FinsiteService } from './finsite/finsite.service';
import { MailService } from './mail/mail.service';


@Injectable()
export class AppService {

  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly finsiteService: FinsiteService,
    private readonly mailService: MailService,
  ) {}
  //     min  hr  day  mon  dayOfWeek
  @Cron('00  02 * * *') // Runs daily 02:00
  async handleDailyTask() {

    console.log('Running daily task');

    // Calculate dates
    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    
    // Format dates as "YYYY-MM-DD"
    const endDate = today.toISOString().split('T')[0];
    const startDate = threeDaysAgo.toISOString().split('T')[0];

    try {
      // Update finsite user database
      await this.finsiteService.getFinsiteBills(process.env.FINSITE_ID, process.env.FINSITE_KEY);
  
      // Try to get transactions from finsite
      
      const newTrans = await this.transactionsService.getTransactionsFromFinsite(startDate, endDate);

      console.log('Transactions retrieved successfully from Finsite.');

      // Format transactions for email
      const formattedTransactions = this.formatTransactionsForEmail(newTrans);
      console.log("new transactions are:\n", formattedTransactions);

  
      // Send success email using Brevo
      await this.mailService.sendMail(
        process.env.BREVO_SENDER,
        'Daily Task Success',
        `The daily task ran successfully - Transactions were retrieved from ${startDate} to ${endDate}:\n ${formattedTransactions}`
      );

    } catch (error) {

      console.error('Failed to retrieve transactions from Finsite:', error.message);

      // Send failure email using Brevo
      await this.mailService.sendMail(
        'info@taxmyself.co.il',
        'Daily Task Failed',
        `The daily task failed with the following error: ${error.message}`
      );
    }

  }


  formatTransactionsForEmail(transactionsSummary: any[]): string {
    return transactionsSummary
      .map(company => {
        const transactionsDetails = company.transactions
          .map(
            (transaction: any) =>
              `  - ${transaction.name} | Date: ${transaction.date} | Sum: ${transaction.sum}`
          )
          .join('\n');
        return `Company: ${company.companyName}\nTransactions:\n${transactionsDetails}`;
      })
      .join('\n\n');
  }
  
}
