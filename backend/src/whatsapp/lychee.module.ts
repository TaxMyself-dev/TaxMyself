import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { DocumentImportModule } from '../document-import/document-import.module';
import { DocumentsModule } from '../documents/documents.module';
import { LycheeClient } from './lychee-client.service';
import { LycheeEventStore } from './lychee-event.store';
import { LycheeIntakeService } from './lychee-intake.service';
import { LycheeWebhookController } from './lychee-webhook.controller';
import { LycheePromptStore } from './lychee-prompt.store';
import { LycheePromptService } from './lychee-prompt.service';
import { LycheeNotificationStore } from './lychee-notification.store';
import {
  LycheeNotificationService,
  LycheeNotificationTransport,
} from './lychee-notification.service';
import {
  LycheePromptTransport,
  ConfiguredLycheeTransport,
} from './lychee-prompt.transport';

@Module({
  imports: [TypeOrmModule.forFeature([User, Business]), DocumentImportModule, DocumentsModule],
  controllers: [LycheeWebhookController],
  providers: [
    LycheeClient,
    LycheeEventStore,
    LycheeIntakeService,
    LycheePromptStore,
    LycheePromptService,
    LycheeNotificationStore,
    LycheeNotificationService,
    {
      provide: LycheeNotificationTransport,
      useClass: ConfiguredLycheeTransport,
    },
    {
      provide: LycheePromptTransport,
      useClass: ConfiguredLycheeTransport,
    },
  ],
})
export class LycheeModule {}
