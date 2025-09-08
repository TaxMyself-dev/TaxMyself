import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
//Modules
import { ClientsModule } from './clients/clients.module';
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { ExpensesModule } from './expenses/expense.module';
import { ExcelModule } from './transactions/transactions.module';
import { CloudModule } from './cloud/cloud.module';
import { SharedModule } from './shared/shared.module';
import { FinsiteModule } from './finsite/finsite.module';
import { DelegationModule } from './delegation/delegation.module';
import { BookkeepingModule } from './bookkeeping/bookkeeping.module';
//Entities
import { Expense } from './expenses/expenses.entity';
import { Income } from './expenses/incomes.entity';
import { Supplier } from './expenses/suppliers.entity';
import { Transactions } from './transactions/transactions.entity';
import { DefaultCategory } from './expenses/default-categories.entity';
import { DefaultSubCategory } from './expenses/default-sub-categories.entity';
import { UserCategory } from './expenses/user-categories.entity';
import { UserSubCategory } from './expenses/user-sub-categories.entity';
import { User } from './users/user.entity';
import { Child } from './users/child.entity';
import { Bill } from './transactions/bill.entity';
import { Source } from './transactions/source.entity';
import { ClassifiedTransactions } from './transactions/classified-transactions.entity';
import { Finsite } from './finsite/finsite.entity';
import { Delegation } from './delegation/delegation.entity';
import { Clients } from './clients/clients.entity';
import { Documents } from './documents/documents.entity';
import { DocLines } from './documents/doc-lines.entity';

import 'dotenv/config'
import admin from 'firebase-admin';
import { TransactionsService } from './transactions/transactions.service';
import { FinsiteService } from './finsite/finsite.service';
import { ExpensesService } from './expenses/expenses.service';
import { MailModule } from './mail/mail.module';
import { MailService } from './mail/mail.service';
import { SettingDocuments } from './documents/settingDocuments.entity';
import { DocumentsModule } from './documents/documents.module';
import { DocumentsService } from './documents/documents.service';
import { ClientsService } from './clients/clients.service';
import { JournalEntry } from './bookkeeping/jouranl-entry.entity';
import { JournalLine } from './bookkeeping/jouranl-line.entity';
import { DefaultBookingAccount } from './bookkeeping/account.entity';
import { BookkeepingService } from './bookkeeping/bookkeeping.service';
import { UsersService } from './users/users.service';
import { DocPayments } from './documents/doc-payments.entity';

let serviceAccount: any;

serviceAccount = {
  "type": process.env.FIREBASE_TYPE,
  "project_id": process.env.FIREBASE_PROJECT_ID,
  "private_key_id": process.env.FIREBASE_PRIVATE_KEY_ID,
  "private_key": process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Replace \n with actual newlines
  "client_email": process.env.FIREBASE_CLIENT_EMAIL,
  "client_id": process.env.FIREBASE_CLIENT_ID,
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": process.env.FIREBASE_CLIENT_X509_CERT_URL,
  "universe_domain": "googleapis.com"
}


@Module({
  imports: [ 
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database:  process.env.DB_DATABASE,
      entities: [User, Child, Expense, Income, Supplier, Transactions, ClassifiedTransactions, Bill, Source, 
                 DefaultCategory, DefaultSubCategory, UserCategory, UserSubCategory, Finsite, Delegation, SettingDocuments, 
                 Clients, Documents, DocLines, DocPayments, JournalEntry, JournalLine, DefaultBookingAccount],
      synchronize: process.env.NODE_ENV !== 'production',
      timezone: 'Z',
    }),
    TypeOrmModule.forFeature([
      User,
      Supplier,
      Transactions,
      ClassifiedTransactions,
      Bill,
      Source,
      Expense,
      DefaultCategory,
      UserCategory,
      DefaultSubCategory,
      UserSubCategory,
      Finsite,
      Delegation,
      SettingDocuments,
      Clients,
      Documents,
      DocLines,
      DocPayments,
      JournalEntry,
      JournalLine,
      DefaultBookingAccount,
      Child
    ]),
    ScheduleModule.forRoot(),
    UsersModule, ReportsModule, ExpensesModule, ExcelModule, CloudModule, SharedModule, FinsiteModule, MailModule, DelegationModule, DocumentsModule, ClientsModule, BookkeepingModule],
    controllers: [AppController],
  providers: [AppService, UsersService, TransactionsService, FinsiteService, ExpensesService, MailService, DocumentsService, ClientsService, BookkeepingService],
})
export class AppModule {

  constructor() {    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      //databaseURL: "",
      //storageBucket: ""
    });
  }
}