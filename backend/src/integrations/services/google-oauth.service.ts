import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Auth, google } from 'googleapis';

/**
 * Scopes requested when a user connects their Google account.
 * openid/email/profile identify the connected account; gmail.readonly is
 * requested up front so the Gmail import (later phase) can reuse this grant
 * without forcing the user through a second consent screen. This phase never
 * calls the Gmail API.
 */
export const GOOGLE_OAUTH_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/gmail.readonly',
];

export interface GoogleTokenResult {
  refreshToken: string | null;
  accessToken: string | null;
  /** Space-delimited scopes actually granted by the user. */
  scopes: string | null;
  /** Expiry of the access token. */
  expiresAt: Date | null;
  /** Verified Google account identity from the id_token. */
  accountId: string | null;
  accountEmail: string | null;
}

/**
 * Google OAuth flow only: authorization URL, code→token exchange, and
 * identity extraction from the id_token. CSRF state lives in
 * OauthStateService (database-backed); persistence of the integration in
 * UserIntegrationsService; provider APIs (Gmail, Drive) are later phases.
 *
 * Credentials are validated lazily (not in the constructor) so a missing
 * GOOGLE_OAUTH_* env var breaks only this flow, not application boot.
 */
@Injectable()
export class GoogleOauthService {
  private readonly logger = new Logger(GoogleOauthService.name);

  constructor() {
    if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET || !process.env.GOOGLE_OAUTH_REDIRECT_URI) {
      this.logger.warn(
        'GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_OAUTH_REDIRECT_URI not fully set. ' +
          'Google account connect will fail until they are added to .env.',
      );
    }
  }

  private createClient(): Auth.OAuth2Client {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error(
        'Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET ' +
          'and GOOGLE_OAUTH_REDIRECT_URI in .env (redirect URI example: ' +
          'http://localhost:3000/integrations/google/callback).',
      );
    }
    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  /**
   * Builds the Google consent URL for an already-registered state
   * (see OauthStateService.createState).
   */
  buildAuthorizeUrl(state: string): string {
    // access_type=offline + prompt=consent so Google always returns a refresh
    // token, including on re-connect after disconnect.
    // select_account forces the account chooser so a user can connect an
    // ADDITIONAL Gmail account instead of silently reusing the signed-in one.
    return this.createClient().generateAuthUrl({
      access_type: 'offline',
      prompt: 'select_account consent',
      scope: GOOGLE_OAUTH_SCOPES,
      include_granted_scopes: true,
      state,
    });
  }

  /**
   * Exchanges the authorization code for tokens and extracts the verified
   * account identity from the id_token (no extra Google API call).
   */
  async exchangeCode(code: string): Promise<GoogleTokenResult> {
    if (!code) {
      throw new BadRequestException('Authorization code is required');
    }

    const client = this.createClient();
    const { tokens } = await client.getToken(code);

    let accountId: string | null = null;
    let accountEmail: string | null = null;
    if (tokens.id_token) {
      const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      accountId = payload?.sub ?? null;
      accountEmail = payload?.email ?? null;
    }

    this.logger.log(
      `Google token exchange succeeded for account=${accountEmail ?? 'unknown'} ` +
        `hasRefreshToken=${!!tokens.refresh_token} scopes=${tokens.scope ?? 'N/A'}`,
    );

    return {
      refreshToken: tokens.refresh_token ?? null,
      accessToken: tokens.access_token ?? null,
      scopes: tokens.scope ?? null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      accountId,
      accountEmail,
    };
  }

  /**
   * OAuth2 client authorized with a user's stored refresh token, for calling
   * Google APIs (Gmail now, Drive in a later phase). The googleapis client
   * refreshes the access token automatically; callers should persist rotated
   * access tokens via the client's 'tokens' event if they want to cache them.
   */
  createClientWithTokens(refreshToken: string): Auth.OAuth2Client {
    const client = this.createClient();
    client.setCredentials({ refresh_token: refreshToken });
    return client;
  }

  /**
   * Best-effort revocation of the grant at Google during disconnect.
   * Never throws — local disconnect (clear tokens, REVOKED) proceeds anyway.
   */
  async revokeToken(token: string): Promise<void> {
    try {
      await this.createClient().revokeToken(token);
      this.logger.log('Google token revoked');
    } catch (error: any) {
      this.logger.warn(`Google token revocation failed (continuing with local disconnect): ${error?.message ?? error}`);
    }
  }
}
