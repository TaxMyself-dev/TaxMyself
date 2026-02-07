import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShaamController } from './shaam.controller';
import { ShaamOauthService } from './services/shaam-oauth.service';
import { ShaamInvoicesService } from './services/shaam-invoices.service';
import { Business } from '../business/business.entity';
import { BusinessService } from '../business/business.service';
import { BusinessModule } from '../business/business.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
    TypeOrmModule.forFeature([Business]),
    BusinessModule,
  ],
  controllers: [ShaamController],
  providers: [ShaamOauthService, ShaamInvoicesService],
  exports: [ShaamOauthService, ShaamInvoicesService],
})
export class ShaamModule {}


