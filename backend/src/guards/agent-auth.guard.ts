import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agents, AgentStatus } from '../delegation/agents.entity';
import { Request } from 'express';
import * as crypto from 'crypto';

export interface AgentRequest extends Request {
  agent?: {
    id: number;
    name: string;
  };
  rawBody?: string;
}

@Injectable()
export class AgentAuthGuard implements CanActivate {
  constructor(
    @InjectRepository(Agents)
    private readonly agentsRepository: Repository<Agents>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgentRequest>();

    // Extract headers
    const apiKey = this.getHeader(request, 'x-api-key');
    const timestamp = this.getHeader(request, 'x-timestamp');
    const signature = this.getHeader(request, 'x-signature');

    // Validate headers exist
    if (!apiKey || !timestamp || !signature) {
      throw new UnauthorizedException('Missing required headers: X-API-KEY, X-TIMESTAMP, X-SIGNATURE');
    }

    // Validate timestamp is within ±5 minutes
    const timestampMs = parseInt(timestamp, 10);
    if (isNaN(timestampMs)) {
      throw new UnauthorizedException('Invalid timestamp format');
    }

    const now = Date.now();
    const timeDiff = Math.abs(now - timestampMs);
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds

    if (timeDiff > fiveMinutes) {
      throw new UnauthorizedException('Timestamp is outside the allowed window (±5 minutes)');
    }

    // Hash API key and lookup agent
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
    
    const agent = await this.agentsRepository.findOne({
      where: {
        apiKeyHash,
        status: AgentStatus.ACTIVE,
      },
    });

    if (!agent) {
      throw new UnauthorizedException('Invalid API key or agent not active');
    }

    // Decrypt secret
    const encKeyBase64 = process.env.AGENT_SECRETS_ENC_KEY_BASE64;
    if (!encKeyBase64) {
      throw new UnauthorizedException('Server configuration error: encryption key not set');
    }

    let encKey: Buffer;
    try {
      encKey = Buffer.from(encKeyBase64, 'base64');
      if (encKey.length !== 32) {
        throw new UnauthorizedException('Server configuration error: invalid encryption key length');
      }
    } catch (error) {
      throw new UnauthorizedException('Server configuration error: invalid encryption key');
    }

    const secret = this.decryptAES256GCM(agent.encryptedHmacSecret, encKey);

    // Build canonical string
    const method = request.method.toUpperCase();
    const path = request.originalUrl || request.url; // originalUrl includes query string
    const rawBody = (request.rawBody || '').toString(); // Use raw body, default to empty string
    
    const canonicalString = `${method}\n${path}\n${timestamp}\n${rawBody}`;

    // Compute expected signature using HMAC-SHA256
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(canonicalString)
      .digest('hex');

    // Constant-time comparison
    const providedSignatureBuffer = Buffer.from(signature, 'hex');
    const expectedSignatureBuffer = Buffer.from(expectedSignature, 'hex');

    if (providedSignatureBuffer.length !== expectedSignatureBuffer.length) {
      throw new UnauthorizedException('Invalid signature');
    }

    if (!crypto.timingSafeEqual(providedSignatureBuffer, expectedSignatureBuffer)) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Attach agent to request
    request.agent = {
      id: agent.id,
      name: agent.name,
    };

    return true;
  }

  private getHeader(request: Request, headerName: string): string | undefined {
    const header = request.headers[headerName.toLowerCase()];
    if (Array.isArray(header)) {
      return header[0];
    }
    return header;
  }

  /**
   * Decrypt data using AES-256-GCM
   * Format: base64(iv:12bytes + authTag:16bytes + encrypted)
   */
  private decryptAES256GCM(encryptedData: string, key: Buffer): string {
    try {
      const combined = Buffer.from(encryptedData, 'base64');
      
      if (combined.length < 28) { // 12 (IV) + 16 (authTag) minimum
        throw new Error('Invalid encrypted data format');
      }

      const iv = combined.slice(0, 12);
      const authTag = combined.slice(12, 28);
      const encrypted = combined.slice(28);

      const decipher = crypto.createDecipheriv('aes-256-gcm', key as any, iv as any);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new UnauthorizedException(`Failed to decrypt agent secret: ${error.message}`);
    }
  }
}