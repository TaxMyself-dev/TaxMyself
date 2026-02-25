import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeezbackWebhookController } from './feezback-webhook.controller';
import { FeezbackWebhookService } from './feezback-webhook.service';
import { FeezbackWebhookEvent } from './entities/feezback-webhook-event.entity';
import { FeezbackPersistenceModule } from '../consent/feezback-persistence.module';
import { FeezbackModule } from '../feezback.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([FeezbackWebhookEvent]),
    FeezbackPersistenceModule,
    FeezbackModule,
  ],
  controllers: [FeezbackWebhookController],
  providers: [FeezbackWebhookService],
})
export class FeezbackWebhookModule { }
