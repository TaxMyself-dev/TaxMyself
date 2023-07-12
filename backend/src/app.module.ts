import { Module, ValidationPipe, MiddlewareConsumer } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { ReportsModule } from './reports/reports.module';
import { User } from './users/user.entity';
import { Report } from './reports/report.entity';
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
        entities: [User, Report],
        synchronize: true}), // remove on production!!
      UsersModule, ReportsModule],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}