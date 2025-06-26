import { Injectable } from '@nestjs/common';
import { TransactionsService } from './transactions/transactions.service';
import { FinsiteService } from './finsite/finsite.service';
import { MailService } from './mail/mail.service';
import { UsersService } from './users/users.service';

@Injectable()
export class AppService {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly finsiteService: FinsiteService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
  ) {}


  async handleDailyTask(): Promise<void> {

  console.log('Running daily task');

  const statusMessages: string[] = [];

  try {

    // 1. Update expired trials
    try {
      await this.usersService.updateExpiredTrials();
      statusMessages.push('✔️ updateExpiredTrials: SUCCESS');
    } catch (err) {
      console.error('❌ updateExpiredTrials failed:', err.message);
      statusMessages.push(`❌ updateExpiredTrials: ${err.message}`);
    }

    // 2. Fetch bills and transactions
    try {
      const formattedTransactions = await this.getBillsAndTransactions();
      statusMessages.push('✔️ getBillsAndTransactions: SUCCESS');
      statusMessages.push(`Transactions:\n${formattedTransactions}`);
    } catch (err) {
      console.error('❌ getBillsAndTransactions failed:', err.message);
      statusMessages.push(`❌ getBillsAndTransactions: ${err.message}`);
    }

    // 3. Send final email
    const subject = statusMessages.some(m => m.startsWith('❌'))
      ? 'Daily Task Completed with Errors'
      : 'Daily Task Success';

    const body = statusMessages.join('\n\n');

    await this.mailService.sendMail(
      process.env.BREVO_SENDER,
      subject,
      body,
    );
  } catch (fatalError) {
    console.error('💥 Fatal error in daily task:', fatalError.message);
    await this.mailService.sendMail(
      process.env.BREVO_SENDER,
      'Daily Task Fatal Error',
      `Unhandled error:\n${fatalError.message}`,
    );
  }
  
}





  // // This method handles the daily task
  // async handleDailyTask(): Promise<void> {
  //   console.log('Running daily task');

  //   // // Calculate dates
  //   // const today = new Date();
  //   // const threeDaysAgo = new Date(today);
  //   // threeDaysAgo.setDate(today.getDate() - 3);

  //   // const currentHour = today.getHours(); // Returns the hour (0–23)
  //   // console.log(`Current hour: ${currentHour}`);

  //   // // Format dates as "YYYY-MM-DD"
  //   // const endDate = today.toISOString().split('T')[0];
  //   // const startDate = threeDaysAgo.toISOString().split('T')[0];

  //   try {

  //     // 1. Update trial statuses
  //     await this.usersService.updateExpiredTrials();

  //     // 2. Fetch and format transactions
  //     const formattedTransactions = await this.getBillsAndTransactions();

  //     // 3. Send success email
  //     await this.mailService.sendMail(
  //       process.env.BREVO_SENDER,
  //       'Daily Task Success',
  //       `The daily task ran successfully. Transactions were retrieved:\n${formattedTransactions}`,
  //     );
  //   } catch (error) {
  //     console.error('Failed daily task:', error.message);
  //     await this.mailService.sendMail(
  //       'info@taxmyself.co.il',
  //       'Daily Task Failed',
  //       `The daily task failed with the following error: ${error.message}`,
  //     );
  //   }

  //   // try {

  //   //   // Update Finsite user database
  //   //   await this.finsiteService.getFinsiteBills(process.env.FINSITE_ID, process.env.FINSITE_KEY);

  //   //   // Try to get transactions from Finsite
  //   //   const newTrans = await this.transactionsService.getTransactionsFromFinsite(startDate, endDate);

  //   //   console.log('Transactions retrieved successfully from Finsite.');

  //   //   // Format transactions for email
  //   //   const formattedTransactions = this.formatTransactionsForEmail(newTrans);
  //   //   console.log('New transactions are:\n', formattedTransactions);

  //   //   // Send success email using Brevo
  //   //   await this.mailService.sendMail(
  //   //     process.env.BREVO_SENDER,
  //   //     'Daily Task Success',
  //   //     `The daily task ran successfully. Transactions were retrieved from ${startDate} to ${endDate}:\n${formattedTransactions}`,
  //   //   );
  //   // } catch (error) {
  //   //   console.error('Failed to retrieve transactions from Finsite:', error.message);

  //   //   // Send failure email using Brevo
  //   //   await this.mailService.sendMail(
  //   //     'info@taxmyself.co.il',
  //   //     'Daily Task Failed',
  //   //     `The daily task failed with the following error: ${error.message}`,
  //   //   );
  //   // }
  // }


  private async getBillsAndTransactions(): Promise<string> {

    const today = new Date();
    const threeDaysAgo = new Date(today);
    threeDaysAgo.setDate(today.getDate() - 3);
    const endDate = today.toISOString().split('T')[0];
    const startDate = threeDaysAgo.toISOString().split('T')[0];

    // Update Finsite user database
    await this.finsiteService.getFinsiteBills(process.env.FINSITE_ID, process.env.FINSITE_KEY);

    // Get transactions from Finsite
    const newTrans = await this.transactionsService.getTransactionsFromFinsite(startDate, endDate);

    console.log('Transactions retrieved successfully from Finsite.');

    // Format transactions for email
    const formatted = this.formatTransactionsForEmail(newTrans);
    console.log('New transactions are:\n', formatted);

    return formatted;
  }


  // Utility method to format transactions for email
  formatTransactionsForEmail(transactionsSummary: any[]): string {
    return transactionsSummary
      .map(company => {
        const transactionsDetails = company.transactions
          .map(
            (transaction: any) =>
              `  - ${transaction.name} | Date: ${transaction.date} | Sum: ${transaction.sum}`,
          )
          .join('\n');
        return `Company: ${company.companyName}\nTransactions:\n${transactionsDetails}`;
      })
      .join('\n\n');
  }
}