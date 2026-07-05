import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserIntegration } from './entities/user-integration.entity';
import { UserIntegrationsService } from './services/user-integrations.service';

/**
 * Provider-agnostic integrations infrastructure (Phase A).
 * OAuth endpoints/controllers arrive in Phase B; provider-specific services
 * (Gmail reader, Drive import) in later phases.
 */
@Module({
  imports: [TypeOrmModule.forFeature([UserIntegration])],
  providers: [UserIntegrationsService],
  exports: [UserIntegrationsService],
})
export class IntegrationsModule {}
