import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeezbackConsent } from './entities/feezback-consent.entity';
import { FeezbackConsentService } from './feezback-consent.service';

@Module({
  imports: [TypeOrmModule.forFeature([FeezbackConsent])],
  providers: [FeezbackConsentService],
  exports: [FeezbackConsentService],
})
export class FeezbackPersistenceModule { }
