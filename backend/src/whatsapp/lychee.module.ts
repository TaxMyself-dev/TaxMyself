import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { DocumentImportModule } from '../document-import/document-import.module';
import { LycheeClient } from './lychee-client.service';
import { LycheeEventStore } from './lychee-event.store';
import { LycheeIntakeService } from './lychee-intake.service';
import { LycheeWebhookController } from './lychee-webhook.controller';
import { LycheePromptStore } from './lychee-prompt.store';
import { LycheePromptService } from './lychee-prompt.service';
import { LycheePromptTransport, NoSendPromptTransport } from './lychee-prompt.transport';

@Module({
  imports: [TypeOrmModule.forFeature([User, Business]), DocumentImportModule],
  controllers: [LycheeWebhookController],
  providers: [LycheeClient, LycheeEventStore, LycheeIntakeService, LycheePromptStore, LycheePromptService,
    { provide: LycheePromptTransport, useClass: NoSendPromptTransport }],
})
export class LycheeModule {}
