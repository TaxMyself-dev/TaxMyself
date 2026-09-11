import { Body, Controller, Get, NotFoundException, Post } from '@nestjs/common';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  WhatsAppSandboxDeliveryOutcome,
  WhatsAppSandboxInboundKind,
  WhatsAppSandboxService,
} from './whatsapp-sandbox.service';

class SandboxInboundDto {
  @IsIn(['text', 'image', 'pdf'])
  kind: WhatsAppSandboxInboundKind;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  text?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  caption?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fileName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_800_000)
  contentBase64?: string;
}

class SandboxTemplateDto {
  @IsIn(['success', 'failed'])
  outcome: WhatsAppSandboxDeliveryOutcome;
}

@Controller('whatsapp/sandbox')
export class WhatsAppSandboxController {
  constructor(private readonly sandbox: WhatsAppSandboxService) {}

  @Get()
  status() {
    this.assertAvailable();
    return {
      available: true,
      provider: 'fake',
      persistence: false,
      externalNetwork: false,
    };
  }

  @Post('inbound')
  simulateInbound(@Body() request: SandboxInboundDto) {
    this.assertAvailable();
    return this.sandbox.simulateInbound(request);
  }

  @Post('template')
  simulateTemplate(@Body() request: SandboxTemplateDto) {
    this.assertAvailable();
    return this.sandbox.simulateTemplate(request.outcome);
  }

  private assertAvailable(): void {
    if (
      process.env.NODE_ENV === 'production' ||
      process.env.WHATSAPP_SANDBOX_ENABLED !== 'true'
    ) {
      throw new NotFoundException();
    }
  }
}
