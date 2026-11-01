import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { DocumentImportModule } from '../document-import/document-import.module';
import { LycheeClient } from './lychee-client.service';
import { LycheeEventStore } from './lychee-event.store';
import { LycheeIntakeService } from './lychee-intake.service';
import { LycheeWebhookController } from './lychee-webhook.controller';
import { LycheeTestRoutingService } from './lychee-test-routing.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Business]), DocumentImportModule],
  controllers: [LycheeWebhookController],
  providers: [LycheeClient, LycheeEventStore, LycheeIntakeService, LycheeTestRoutingService],
})
export class LycheeModule {}
