import { Module, ValidationPipe, MiddlewareConsumer, NestModule, RequestMethod } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { ExpensesModule } from './expenses/expense.module';
import { User } from './users/user.entity';
import { Report } from './reports/report.entity';
import { PreauthMiddleware } from './auth/preauth.middleware';
import { Expense } from './expenses/expenses.entity';
const cookieSession = require('cookie-session');

@Module({
  imports: 
    [TypeOrmModule.forRoot({
        type: 'mysql',
        host: '172.104.153.244',
        port: 3306,
        username: 'fintaxco_taxmyself_dev',
        password: 'Fc3usTsjA3WG',
        database: 'fintaxco_taxmyself_dev',
        entities: [User, Report, Expense],
        synchronize: true}), // remove on production!!
      UsersModule, ReportsModule, ExpensesModule],
    controllers: [AppController],
    providers: [AppService],
})
//export class AppModule {}
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(PreauthMiddleware).forRoutes({
      path: '*', method: RequestMethod.ALL
    });
  }
}
