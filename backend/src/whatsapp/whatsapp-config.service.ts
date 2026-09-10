import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { WhatsAppProviderKind } from './whatsapp.types';

@Injectable()
export class WhatsAppConfigService {
  isEnabled(): boolean {
    return process.env.WHATSAPP_ENABLED === 'true';
  }

  providerKind(): WhatsAppProviderKind {
    const configured = process.env.WHATSAPP_PROVIDER?.trim().toLowerCase();
    if (!configured || configured === 'fake') return 'fake';
    if (configured === 'meta') return 'meta';
    if (!this.isEnabled()) return 'fake';
    throw new ServiceUnavailableException(
      'WhatsApp integration is not configured',
    );
  }

  verifyToken(): string {
    return this.required('WHATSAPP_VERIFY_TOKEN');
  }

  appSecret(): string {
    return this.required('WHATSAPP_APP_SECRET');
  }

  assertMetaTransportConfigured(): void {
    this.required('WHATSAPP_APP_SECRET');
    this.required('WHATSAPP_VERIFY_TOKEN');
    this.required('WHATSAPP_ACCESS_TOKEN');
    this.required('WHATSAPP_GRAPH_API_VERSION');
    this.required('WHATSAPP_WABA_ID');
    this.required('WHATSAPP_PHONE_NUMBER_ID');
  }

  private required(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
      throw new ServiceUnavailableException(
        'WhatsApp integration is not configured',
      );
    }
    return value;
  }
}
