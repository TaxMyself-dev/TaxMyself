import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { Business } from '../src/business/business.entity';
import { Transactions } from '../src/transactions/transactions.entity';
import { DataSource } from 'typeorm';
import { User } from '../src/users/user.entity';
import { Child } from '../src/users/child.entity';
import { ClassifiedTransactions } from '../src/transactions/classified-transactions.entity';
import { Expense } from '../src/expenses/expenses.entity';
import { Income } from '../src/expenses/incomes.entity';
import { Bill } from '../src/transactions/bill.entity';
import { Source } from '../src/transactions/source.entity';
import { UserCategory } from '../src/expenses/user-categories.entity';
import { UserSubCategory } from '../src/expenses/user-sub-categories.entity';
import { Delegation } from '../src/delegation/delegation.entity';
import { SettingDocuments } from '../src/documents/settingDocuments.entity';
import { Supplier } from '../src/expenses/suppliers.entity';
import { Documents } from '../src/documents/documents.entity';
import { DocLines } from '../src/documents/doc-lines.entity';
import { DocPayments } from '../src/documents/doc-payments.entity';
import { JournalEntry } from '../src/bookkeeping/jouranl-entry.entity';
import { JournalLine } from '../src/bookkeeping/jouranl-line.entity';
import { Clients } from '../src/clients/clients.entity';

async function clearDevData() {
  console.log('🚀 Bootstrapping NestJS...');
  const app = await NestFactory.createApplicationContext(AppModule);

  const dataSource = app.get(DataSource); // 🔥 this is the same DataSource created by TypeOrmModule.forRoot()

  console.log('🧹 Disabling foreign key checks...');
  await dataSource.query('SET FOREIGN_KEY_CHECKS = 0;');

  console.log('🧹 Clearing All tables...');
  await dataSource.getRepository(User).clear();
  await dataSource.getRepository(Child).clear();
  await dataSource.getRepository(Business).clear();
  await dataSource.getRepository(Transactions).clear();
  await dataSource.getRepository(ClassifiedTransactions).clear();
  await dataSource.getRepository(Expense).clear();
  await dataSource.getRepository(Income).clear();
  await dataSource.getRepository(Bill).clear();
  await dataSource.getRepository(Source).clear();
  await dataSource.getRepository(UserCategory).clear();
  await dataSource.getRepository(UserSubCategory).clear();
  await dataSource.getRepository(Delegation).clear();
  await dataSource.getRepository(SettingDocuments).clear();
  await dataSource.getRepository(Documents).clear();
  await dataSource.getRepository(DocLines).clear();
  await dataSource.getRepository(DocPayments).clear();
  await dataSource.getRepository(JournalEntry).clear();
  await dataSource.getRepository(JournalLine).clear();
  await dataSource.getRepository(Clients).clear();
  await dataSource.getRepository(Supplier).clear();

  console.log('✅ Done! Tables are now empty.');

  await app.close();
}

clearDevData().catch((err) => {
  console.error('❌ Error clearing dev data:', err);
  process.exit(1);
});
