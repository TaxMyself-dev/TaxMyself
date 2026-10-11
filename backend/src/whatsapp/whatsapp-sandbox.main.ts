import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WhatsappDevelopmentConfig } from './whatsapp-development.config';
import { WhatsappDevelopmentController } from './whatsapp-development.controller';
import { WhatsappDevelopmentGuard } from './whatsapp-development.guard';
import { WhatsappRoutingService } from './whatsapp-routing.service';

@Module({
  controllers: [WhatsappDevelopmentController],
  providers: [WhatsappDevelopmentConfig, WhatsappDevelopmentGuard, WhatsappRoutingService],
})
class WhatsappSandboxModule {}

async function bootstrap() {
  if (process.env.NODE_ENV === 'production') throw new Error('Sandbox is disabled in production');
  // No dotenv: sandbox must not load the copied database/Drive credentials.
  process.env.WHATSAPP_DEV_ENABLED = 'true';
  if (!process.env.WHATSAPP_DEV_TOKEN || process.env.WHATSAPP_DEV_TOKEN.length < 24) {
    throw new Error('Set WHATSAPP_DEV_TOKEN to at least 24 characters');
  }
  process.env.WHATSAPP_DEV_CONTACTS ||= JSON.stringify([
    { phone: '0500000001', firebaseId: 'sandbox-user', businesses: ['sandbox-business'] },
    { phone: '0500000002', firebaseId: 'sandbox-multi', businesses: ['business-a', 'business-b'] },
  ]);
  const app = await NestFactory.create(WhatsappSandboxModule, { logger: ['error', 'warn'] });
  await app.listen(Number(process.env.WHATSAPP_SANDBOX_PORT || 8091), '127.0.0.1');
  console.log('WhatsApp sandbox ready on loopback (no Meta, database or Drive connection)');
}

bootstrap().catch(() => { console.error('Sandbox startup failed; check development configuration'); process.exitCode = 1; });
