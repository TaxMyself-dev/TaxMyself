import { Module } from '@nestjs/common';
import { DocumentImportModule } from 'src/document-import/document-import.module';
import { MailgunInboundController } from './mailgun-inbound.controller';
import { MailgunSignatureService } from './mailgun-signature.service';

@Module({
  imports: [DocumentImportModule],
  controllers: [MailgunInboundController],
  providers: [MailgunSignatureService],
})
export class InboundEmailModule {}
