import { Module, ValidationPipe, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { ExpensesModule } from './expenses/expense.module';
import { ExcelModule } from './transactions/transactions.module';
import { User } from './users/user.entity';
import { Report } from './reports/report.entity';
import { PreauthMiddleware } from './auth/preauth.middleware';
import { Expense } from './expenses/expenses.entity';
import { Supplier } from './suppliers/supplier.entity';
import { Transactions } from './transactions/transactions.entity';
import * as firebase from 'firebase-admin';
import * as serviceAccount from './auth/firebaseServiceAccount.json';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';

import { VAT_RATE_2023 } from './constants';
import { SuppliersModule } from './suppliers/suppliers.module';

const cookieSession = require('cookie-session');

const firebase_params = {
  type: serviceAccount.type,
  projectId: serviceAccount.project_id,
  privateKeyId: serviceAccount.private_key_id,
  privateKey: serviceAccount.private_key,
  clientEmail: serviceAccount.client_email,
  clientId: serviceAccount.client_id,
  authUri: serviceAccount.auth_uri,
  tokenUri: serviceAccount.token_uri,
  authProviderX509CertUrl: serviceAccount.auth_provider_x509_cert_url,
  clientC509CertUrl: serviceAccount.client_x509_cert_url
}
const scrypt = promisify(_scrypt);

@Module({
  imports: 
    [TypeOrmModule.forRoot({
        type: 'mysql',
        host: '172.104.153.244',
        port: 3306,
        username: 'fintaxco_taxmyself_dev',
        password: 'Fc3usTsjA3WG',
        database: 'fintaxco_taxmyself_dev',
        entities: [User, Report, Expense, Supplier, Transactions],
        synchronize: true}), // remove on production!!
      UsersModule, ReportsModule, ExpensesModule, SuppliersModule, ExcelModule],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {

  private defaultApp: any;

  constructor() {
    this.defaultApp = firebase.initializeApp({
        credential: firebase.credential.cert(firebase_params),
        databaseURL: "https://fir-auth-bd895.firebaseio.com",
        storageBucket: "gs://taxmyself-5d8a0.appspot.com"
    });
  }
}

// export class AppModule implements NestModule {
//   configure(consumer: MiddlewareConsumer) {
//     consumer.apply(PreauthMiddleware).forRoutes({
//       path: '*', method: RequestMethod.ALL
//     });
//   }
// }
