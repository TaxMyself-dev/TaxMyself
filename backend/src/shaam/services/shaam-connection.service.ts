import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShaamEnvironment } from '../shaam.constants';
import { ShaamTokenResponseDto } from '../dto/shaam-token-response.dto';
import { ShaamConnection } from '../entities/shaam-connection.entity';
import { ShaamConnectionStatus, ShaamProduct } from '../entities/shaam.enums';
import { decryptToken, encryptToken } from '../utils/shaam-encryption.util';
import {
  ShaamOauthService,
  ShaamReauthorizationRequiredError,
} from './shaam-oauth.service';

@Injectable()
export class ShaamConnectionService {
  constructor(
    @InjectRepository(ShaamConnection)
    private readonly repo: Repository<ShaamConnection>,
    private readonly allocationOauth: ShaamOauthService,
  ) {}

  async saveToken(
    businessId: number,
    actorFirebaseId: string,
    product: ShaamProduct,
    environment: ShaamEnvironment,
    token: ShaamTokenResponseDto,
  ): Promise<void> {
    let connection = await this.repo.findOne({
      where: { businessId, product, environment },
    });
    connection ??= this.repo.create({ businessId, product, environment });
    connection.accessToken = encryptToken(token.access_token);
    // SHAAM may rotate only the access token during refresh. Keep the existing
    // long-lived refresh token unless the response explicitly replaces it.
    if (token.refresh_token) {
      connection.refreshToken = encryptToken(token.refresh_token);
    } else if (!connection.refreshToken) {
      connection.refreshToken = null;
    }
    connection.expiresAt = new Date(Date.now() + token.expires_in * 1000);
    connection.scopes = token.scope || null;
    connection.status = ShaamConnectionStatus.ACTIVE;
    connection.connectedByFirebaseId = actorFirebaseId;
    await this.repo.save(connection);
  }

  async status(
    businessId: number,
    product: ShaamProduct,
    environment: ShaamEnvironment,
  ): Promise<{ connected: boolean; expiresAt: Date | null }> {
    // Connection status is also the pre-flight used by the document UI. Resolve
    // a usable token here so an expired short-lived access token is refreshed
    // before the browser decides that a new three-month authorization is needed.
    const accessToken = await this.getValidAccessToken(
      businessId,
      product,
      environment,
    );
    const row = await this.repo.findOne({
      where: { businessId, product, environment },
    });
    return {
      connected: !!accessToken,
      expiresAt: row?.expiresAt ?? null,
    };
  }

  async getValidAccessToken(
    businessId: number,
    product: ShaamProduct,
    environment: ShaamEnvironment,
  ): Promise<string | null> {
    const row = await this.repo.findOne({
      where: { businessId, product, environment },
    });
    if (
      !row?.accessToken ||
      row.status !== ShaamConnectionStatus.ACTIVE ||
      !row.expiresAt
    ) {
      return null;
    }
    if (row.expiresAt.getTime() > Date.now() + 5 * 60 * 1000) {
      return decryptToken(row.accessToken);
    }
    if (product !== ShaamProduct.INVOICE_ALLOCATION || !row.refreshToken) {
      row.status = ShaamConnectionStatus.REAUTH_REQUIRED;
      await this.repo.save(row);
      return null;
    }
    let refreshed: ShaamTokenResponseDto;
    try {
      refreshed = await this.allocationOauth.refreshAccessToken(
        decryptToken(row.refreshToken),
      );
    } catch (error) {
      if (error instanceof ShaamReauthorizationRequiredError) {
        row.status = ShaamConnectionStatus.REAUTH_REQUIRED;
        await this.repo.save(row);
        return null;
      }
      // Network, timeout and SHAAM server/configuration failures are not proof
      // that the user's long-term grant was revoked. Preserve it and surface
      // the failure instead of starting another browser authorization.
      throw error;
    }
    await this.saveToken(
      businessId,
      row.connectedByFirebaseId,
      product,
      environment,
      refreshed,
    );
    return refreshed.access_token;
  }
}
