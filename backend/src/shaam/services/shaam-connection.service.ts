import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShaamEnvironment } from '../shaam.constants';
import { ShaamTokenResponseDto } from '../dto/shaam-token-response.dto';
import { ShaamConnection } from '../entities/shaam-connection.entity';
import { ShaamConnectionStatus, ShaamProduct } from '../entities/shaam.enums';
import { decryptToken, encryptToken } from '../utils/shaam-encryption.util';
import { ShaamOauthService } from './shaam-oauth.service';

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
    connection.refreshToken = token.refresh_token
      ? encryptToken(token.refresh_token)
      : null;
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
    const refreshed = await this.allocationOauth.refreshAccessToken(
      decryptToken(row.refreshToken),
    );
    await this.saveToken(
      businessId,
      row.connectedByFirebaseId,
      product,
      environment,
      refreshed,
    );
    return refreshed.access_token;
  }

  async markReauthorizationRequired(
    businessId: number,
    product: ShaamProduct,
    environment: ShaamEnvironment,
  ): Promise<void> {
    const row = await this.repo.findOne({
      where: { businessId, product, environment },
    });
    if (!row) return;

    row.status = ShaamConnectionStatus.REAUTH_REQUIRED;
    row.accessToken = null;
    row.refreshToken = null;
    row.expiresAt = null;
    row.scopes = null;
    await this.repo.save(row);
  }
}
