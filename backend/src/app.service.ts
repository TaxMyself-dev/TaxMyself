import { Injectable } from '@nestjs/common';
import { TransactionProcessingService } from './transactions/transaction-processing.service';
import { MailService } from './mail/mail.service';
import { BillingService } from './billing/services/billing.service';
import { TasksGeneratorService } from './accountant-tasks/tasks-generator.service';

@Injectable()
export class AppService {
  constructor(
    private readonly transactionProcessingService: TransactionProcessingService,
    private readonly mailService: MailService,
    private readonly billingService: BillingService,
    private readonly tasksGeneratorService: TasksGeneratorService,
  ) {}


  async handleDailyTask(): Promise<void> {

  console.log('Running daily task');

  const statusMessages: string[] = [];

  try {

    // 1. Expire overdue trial subscriptions (Subscription.status/trialEnd driven)
    try {
      const expiredCount = await this.billingService.expireOverdueTrials();
      statusMessages.push(`✔️ expireOverdueTrials: SUCCESS (${expiredCount} expired)`);
    } catch (err) {
      console.error('❌ expireOverdueTrials failed:', err.message);
      statusMessages.push(`❌ expireOverdueTrials: ${err.message}`);
    }

    // 3. Daily cache cleanup (full_transactions_cache + cache state)
    try {
      await this.transactionProcessingService.handleDailyCacheCleanup();
      statusMessages.push('✔️ handleDailyCacheCleanup: SUCCESS');
    } catch (err) {
      console.error('❌ handleDailyCacheCleanup failed:', err.message);
      statusMessages.push(`❌ handleDailyCacheCleanup: ${err.message}`);
    }

    // 4. Recurring task generation runs lazily on tab entry now
    // (see ReportWorkflowService.listForClient + AccountantTasksService.list).
    // The manual "רענן משימות אוטומטיות" button still calls
    // POST /accountant-tasks/generate, which runs `generateForToday` directly.

    // 4. Send final email
    // const subject = statusMessages.some(m => m.startsWith('❌'))
    //   ? 'Daily Task Completed with Errors'
    //   : 'Daily Task Success';

    // const body = statusMessages.join('\n\n');

    // await this.mailService.sendMail(
    //   process.env.BREVO_SENDER,
    //   subject,
    //   body,
    // );

    // 5. Send email to admin
    
  } catch (fatalError) {
    console.error('💥 Fatal error in daily task:', fatalError.message);
    await this.mailService.sendMail(
      process.env.BREVO_SENDER,
      'Daily Task Fatal Error',
      `Unhandled error:\n${fatalError.message}`,
    );
  }
  
}
}
