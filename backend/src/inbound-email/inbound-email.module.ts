import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Business } from 'src/business/business.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { DocumentImportModule } from 'src/document-import/document-import.module';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { User } from 'src/users/user.entity';
import { InboundEmailAddressController } from './inbound-email-address.controller';
import { InboundEmailAddress } from './inbound-email-address.entity';
import { InboundEmailAddressService } from './inbound-email-address.service';
import { MailgunInboundController } from './mailgun-inbound.controller';
import { MailgunSignatureService } from './mailgun-signature.service';

@Module({
  imports: [
    DocumentImportModule,
    TypeOrmModule.forFeature([
      InboundEmailAddress,
      Business,
      Delegation,
      User,
    ]),
  ],
  controllers: [MailgunInboundController, InboundEmailAddressController],
  providers: [
    FirebaseAuthGuard,
    MailgunSignatureService,
    InboundEmailAddressService,
  ],
})
export class InboundEmailModule {}
