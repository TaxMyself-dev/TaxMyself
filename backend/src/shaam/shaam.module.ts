import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ShaamController } from './shaam.controller';
import { ShaamOauthService } from './services/shaam-oauth.service';
import { ShaamInvoicesService } from './services/shaam-invoices.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 5,
    }),
  ],
  controllers: [ShaamController],
  providers: [ShaamOauthService, ShaamInvoicesService],
  exports: [ShaamOauthService, ShaamInvoicesService],
})
export class ShaamModule {}


