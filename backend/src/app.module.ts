import { Module, ValidationPipe, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule, ConfigService  } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
//Modules
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { ExpensesModule } from './expenses/expense.module';
import { ExcelModule } from './transactions/transactions.module';
import { CloudModule } from './cloud/cloud.module';
//Entities
import { Expense } from './expenses/expenses.entity';
import { Supplier } from './expenses/suppliers.entity';
import { Transactions } from './transactions/transactions.entity';
import { DefaultCategory } from './expenses/categories.entity';
import { User } from './users/user.entity';
import { Child } from './users/child.entity';

import * as firebase from 'firebase-admin';
//import * as serviceAccount from './auth/firebaseServiceAccount.json';
//import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';

import { VAT_RATE_2023 } from './constants';
import { SharedModule } from './shared/shared.module';
import 'dotenv/config'

import admin from 'firebase-admin';
let serviceAccount: any;
// if (process.env.NODE_ENV === 'production') {
//     console.log("NODE_ENV is ",process.env.NODE_ENV);
    //serviceAccount = require('../src/auth/firebaseServiceAccount-prod.json');
//     console.log("prod key is" ,serviceAccount.private_key_id);
// } else {
//     console.log("NODE_ENV is ",process.env.NODE_ENV);
     serviceAccount = require('../src/auth/firebaseServiceAccount-dev.json');
//     console.log("prod key is" ,serviceAccount.private_key_id);    
// }
//import serviceAccount from './auth/firebaseServiceAccount.json';

//For DEV:
// const firebase_params_dev = {
//   type: process.env.FIREBASE_TYPE, //serviceAccount.type,
//   projectId: process.env.FIREBASE_PROJECT_ID, //serviceAccount.project_id,
//   privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID, //serviceAccount.private_key_id,
//   privateKey: process.env.FIREBASE_PRIVATE_KEY, //serviceAccount.private_key,
//   clientEmail: process.env.FIREBASE_CLIENT_EMAIL, //serviceAccount.client_email,
//   clientId: process.env.FIREBASE_CLIENT_ID, //serviceAccount.client_id,
//   authUri: process.env.FIREBASE_AUTH_URI, //serviceAccount.auth_uri,
//   tokenUri: process.env.FIREBASE_TOKEN_URI, //serviceAccount.token_uri,
//   authProviderX509CertUrl: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL, //serviceAccount.auth_provider_x509_cert_url,
//   clientC509CertUrl: process.env.FIREBASE_CLIENT_X509_CERT_URL//serviceAccount.client_x509_cert_url
// }

// //For PROD
// const firebase_params = {
//   type: process.env.FIREBASE_TYPE, //serviceAccount.type,
//   project_id: process.env.FIREBASE_PROJECT_ID, //serviceAccount.project_id,
//   private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID, //serviceAccount.private_key_id,
//   private_key: process.env.FIREBASE_PRIVATE_KEY, //serviceAccount.private_key,
//   client_email: process.env.FIREBASE_CLIENT_EMAIL, //serviceAccount.client_email,
//   client_id: process.env.FIREBASE_CLIENT_ID, //serviceAccount.client_id,
//   auth_uri: process.env.FIREBASE_AUTH_URI, //serviceAccount.auth_uri,
//   token_uri: process.env.FIREBASE_TOKEN_URI, //serviceAccount.token_uri,
//   auth_provider_x509_cert_url: process.env.FIREBASE_AUTH_PROVIDER_X509_CERT_URL, //serviceAccount.auth_provider_x509_cert_url,
//   client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,//serviceAccount.client_x509_cert_url
//   universe_domain: process.env.FIREBASE_UNIVERSE_DOMAIN
// }

//const firebase_params = process.env.NODE_ENV === 'production' ? firebase_params_prod : firebase_params_dev; 

//const scrypt = promisify(_scrypt);

@Module({
  imports: [ 
    ConfigModule.forRoot({
      isGlobal: true,
      // envFilePath: process.env.NODE_ENV === 'production' ? '.env.production' : '.env.development',
    }),
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      username: process.env.DB_USERNAME, // process.env.DB_USERNAME
      password: process.env.DB_PASSWORD,
      database:  process.env.DB_DATABASE,
      entities: [User, Child, Expense, Supplier, Transactions, DefaultCategory],
      synchronize: process.env.NODE_ENV !== 'production'}), // remove on production!!
    UsersModule, ReportsModule, ExpensesModule, ExcelModule, CloudModule, SharedModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {

  private defaultApp: any;

  constructor() {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      //databaseURL: 'https://twisteringo-310c3.firebaseio.com',
    });
    // this.defaultApp = firebase.initializeApp({
    //     credential: firebase.credential.cert(firebase_params)
    //     //databaseURL: "https://fir-auth-bd895.firebaseio.com",
    //     //storageBucket: "gs://taxmyself-5d8a0.appspot.com"
    // });
  }
}