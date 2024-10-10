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
import { SharedModule } from './shared/shared.module';
//Entities
import { Expense } from './expenses/expenses.entity';
import { Supplier } from './expenses/suppliers.entity';
import { Transactions } from './transactions/transactions.entity';
import { Category } from './expenses/categories.entity';
import { DefaultSubCategory } from './expenses/default-sub-categories.entity';
import { UserSubCategory } from './expenses/user-sub-categories.entity';
import { User } from './users/user.entity';
import { UserYearlyData } from './users/user-yearly-data.entity';
import { Child } from './users/child.entity';
import { Bill } from './transactions/bill.entity';
import { Source } from './transactions/source.entity';

import * as firebase from 'firebase-admin';
//import * as serviceAccount from './auth/firebaseServiceAccount.json';
//import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';

import { VAT_RATE_2023 } from './constants';
import 'dotenv/config'

import admin from 'firebase-admin';
import { ClassifiedTransactions } from './transactions/classified-transactions.entity';
let serviceAccount: any;

// if (process.env.NODE_ENV === 'production') {
//   console.log("NODE_ENV is ",process.env.NODE_ENV);
//   serviceAccount = require('../src/auth/firebaseServiceAccount-prod.json');
//   console.log("prod key is" ,serviceAccount.private_key_id);
// } else {
//   console.log("NODE_ENV is ",process.env.NODE_ENV);
//   serviceAccount = require('../src/auth/firebaseServiceAccount-dev.json');
//   console.log("prod key is" ,serviceAccount.private_key_id);    
// }


if (process.env.NODE_ENV === 'development') {
//For dev:
serviceAccount = {
  "type": "service_account",
  "project_id": "taxmyself-5d8a0",
  "private_key_id": "32b7f7eef28fecde9a9c2f1e0df26c3cbca5c4a9",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQCU1Jxg0L9VQm7d\nJjHcLTkhoO3Hhz+Srld1uc+IXIm+k4FNwV4C+OeZ4sUxtyff5ZUPOw/ou3K/mOaE\nockXHVjOfPnDdyXJaKWicFjArXOFXuzQzq2rht+8fCx8aQLRILGNyOYTn8ZqvlBn\ncGmqNkBE9XEBBlPMwJDg8bhyTRKqcKl85D3yrBNDDflWXJL7GAcMkTyrvwKv0mR0\nwj7CY2CozmoReBITupYt2TTkA9SrHVHdMeecUL4C36AxzplJIzPzJht/MzIJTEd7\n29/Dxowi1dlyHjzlHf/iGq41ZLXkAxoVsI7XLTZ630a+NhQHsj63b+gs2uSKFPBW\ntLxyjsgJAgMBAAECggEAJyx3JLyNQAHGcIs3IH7+xK05KQWeZBtjhecsivXgg7sL\nk83L0vh07XpU8SsGYdZqD6I6I8YDBA9YzZxP87eTwnX+v8ZCuerDfigYFE8TUw2T\nQ7rC150ektwUUYLKbQUv9uPkO1IYxcvmGfPqvBSfggcggWaK9B/TgoHdTKigux+Z\nghyxhJyj0Yw2AMOa4YWEby66D2GaOA2X9TUdDKhTK7xIQxBcQ9v0jJpWDmWTO3ok\nDrOvSHoEy3TpewaJizzaKPTyUYVl5yDv0n8d0RhHI9oauqaRlkOnxbYthFPLEbnf\nmUytJbQBKEI8OTOLZi1jivXxhpvqO0I2xIfCOkWmqQKBgQDL+FkVVtytAwsMm/ZK\nze5afVS4va86oG7OsosXu+Q28KvDnmszlL7DyhF/4MNF5XdNyv/8kpSZAXTtcC6t\nTKIYASfOgUk+z30Zw222xp4E2IUe4Q4zWko/qdLzjFsG1wUXrDiaTv8HjdU6euFA\nG3lWwk/hVdsS0y6uQ+VBqiPgDwKBgQC6y4m1sYjPrLuqu4DpRN9DmLeVrXr+6n+D\nyidyggn7+s6upq+uJGS9GZ+ZGf5QmqZZa+zKebPf05frHy3wDlY6lD5sPTpdaszo\noY/X9MltMtlIfaHEq22lqiNKyNYqj6oUxGhWFppq7/T/LpZxpw2xyMJntgCMewaj\nzXASuGQ+ZwKBgA/jY4UPBBeSAh1UVMYU7nksBBpz5B9r+dWuALmzkB5bdvXA9FbL\nQmTb66sLZgqeykFMC86v2FVm0KXiNDCZpJK8HE6wsXTsErGcEILJS+vStePm4gVM\nBjaZUu5Xw4tv2lyytKIIf0MmYDKy+bLVsQj6D+DcoDkCLEO01DneN/cvAoGAHlxO\nubVtYzPUHN/1B/UlxLrhu/ZCc4RxzV3iI353WPle9owpKcjIhuPPSPcsmrVILGia\nSB6X2d1uZ8zdjpMF+Od3behVwDFHtNftpVAoHROStXGWBX1HiRGqQtF53dkT7+Qs\ngTGTT6ZIz+EmmrpoQ2k6D9lJJYwpfB48BQ7rXCkCgYAXlRu9EX7wYhhDvzSSkXLO\nW7z/zEL2jX+KWxCAi7mHlt/+aced3VxCNfVys3Uea06ZAQhft778uu6wXH6kDNCK\npTOna+VmRXYGpUWPsa+UInsoMEgLAk8BMZEBE07MdS7hnoHh7urOuaTFKmSdZKds\nmmIm/RHrLJRgJA3H62toRQ==\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-21pq1@taxmyself-5d8a0.iam.gserviceaccount.com",
  "client_id": "112147622877336190672",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-21pq1%40taxmyself-5d8a0.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}
}
else {
//For prod:
serviceAccount = {
  "type": "service_account",
  "project_id": "taxmyself-prod",
  "private_key_id": "8e8bdfa6de33b576bc74ae6c10d5ab986d9c7d77",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDflkrEJL27Ru8V\n/JRqoDRBSVIiPVQPuXqlkR8bMnvBPGlC199MQyW0PD8nBCuoNaEC12CMvUlT+j2G\nVCm2Cv43HyDPC2hvDB9Xg/v0aG9dhEex23vTuCyLxU5CBu4l5H+JxV5nMN+OrTOm\nTtPGoyxT+/Zwd6btROLRlunkK/arJDoP5sVj7DxYw8UB68uqEhSAsvBi5tHzn5ap\nKFnFtKW/NyMZaBwlncJtKE4GxYIEu6+TOZ3vcJ6ojwZfK+XXIVoMpKyQJzcbHy3O\nSYYpdqEWE4lN0DvRe7qekwdGf6LC4m+u0GNIJYJP2tdywG9fo/O9NNJ0sZm+h4Ww\nNKMtbUXVAgMBAAECggEAIuAQCHlMqP4fA/hydBFKJVbY+2NCjfNaCKJSzky5FgKk\nzprah0xAANWW6jCR2LqIw2cx9bH+0p0JZL8TBITBc3qlBPacExo6d02sisqReG5O\nOpVoQrWLKUAc/VqUYg+6vxQsrf7nGBu3Hz1Tdjv0iaMXJSLcxEzG7ndSQ1eCMd55\nld06FtG9Mhg5PWqzxhdz9BFKV8TgC9Wb9owsMSGsWyefFHQOz92qgZfpQQsyj3bx\n23s0oqfsvC1KSP7KG+2VoGtOKpG3i/T7qvCxcNA5m5q7tQx0vWm/dfjZAGPCBZsi\nNk+i8PVVHLQBtmpitwBZNNQ1rhAizLZ6rqqlQnw5XwKBgQDyA7X75FwH/x2JjEfB\njSPfZhLFJitaJc+SSsyw3BpRNJYdWaN5uQbVozvbxs0rLGzKIvjYOq+TDv/f9f9s\nx802VzUM65+lQWMG4MUOaD09lzSdgnjI9KfW3lxR5uyub1qPxwZHRk36nhFIMXa+\n29it4Vh33bx8D7IoVrcXzD9ijwKBgQDsgfi3qqqPyR3qeunqqhdQZm/Go4pAQPfN\neIlxz4yYNiKZvNWrYP7LDLPKcHEOMRWz9K2BVIaPgp6NZGa1EcpgsBdSEDEE17sV\nqaerHg29tDp7dTC2eAsTGev7P9NnfS+AzomhYfykR6pe8w07oWFpakgABzD/KNj1\n/ooOH/FzWwKBgQChCfkZkR3wMEEeWtsQnvNE3y4UQ87LIKfbp6xG718PtBdDlnci\nMw2qMQFOwB2b4ebOJrFBaOOVzoBTLeT2JImX5DWn0E4d78GOPRjC+nftuOTI/p2S\n0sGwR6xUz32koPI5A+1Ylh6janUDfe6PF8k6At4UfNbEEsmw7+rLihyPXwKBgHHq\nEC/2xfxHdF9SIITktCIHlOLqNlbIdBLFcf4dZ6yQto2yBIBtUYvfbGGfUvTw83Ef\n8soOOlm5IkEcENQ54246oqDmJ5YbioLemmGzMg8jVd/NDE929m6W17DGhz6bb1vt\nHyFaHuPJmOfuzXrhOhgaFt/clt7vf8DMfxZakGNtAoGABxAzZH7WjT1cWGZ2dyoW\nFplsn94zQ7IEAlqmfQz07YFnuFrWEvURbF2qMwFCNJuPgepmYrkHPX1/GCJ4oqdh\nzr20eB0/v+ClKYVyELTXSxNKLOMuSEzmi9R2txTo2ttx6tfRxAhDhFAX3WAANmL2\ngVxDWthaEanqJKXwXY6Is/E=\n-----END PRIVATE KEY-----\n",
  "client_email": "firebase-adminsdk-5wy4s@taxmyself-prod.iam.gserviceaccount.com",
  "client_id": "115600138738316697295",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-5wy4s%40taxmyself-prod.iam.gserviceaccount.com",
  "universe_domain": "googleapis.com"
}
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
      entities: [User, Child, Expense, Supplier, Transactions, ClassifiedTransactions, Bill, Source, Category, DefaultSubCategory, UserSubCategory, UserYearlyData],
      synchronize: process.env.NODE_ENV !== 'production'}),
    UsersModule, ReportsModule, ExpensesModule, ExcelModule, CloudModule, SharedModule],
  controllers: [AppController],
  providers: [AppService],
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