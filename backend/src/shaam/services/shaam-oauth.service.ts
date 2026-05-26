import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { getShaamUrls, SHAAM_SCOPE, REQUEST_TIMEOUT_MS } from '../shaam.constants';
import { ShaamTokenResponseDto } from '../dto/shaam-token-response.dto';
import * as crypto from 'crypto';

@Injectable()
export class ShaamOauthService {
  private readonly logger = new Logger(ShaamOauthService.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly urls: ReturnType<typeof getShaamUrls>;

  constructor(private readonly httpService: HttpService) {
    this.clientId = process.env.SHAAM_CLIENT_ID || '';
    this.clientSecret = process.env.SHAAM_CLIENT_SECRET || '';
    this.redirectUri = process.env.SHAAM_REDIRECT_URI || '';

    if (!this.clientId || !this.clientSecret || !this.redirectUri) {
      const missing = [];
      if (!this.clientId) missing.push('SHAAM_CLIENT_ID');
      if (!this.clientSecret) missing.push('SHAAM_CLIENT_SECRET');
      if (!this.redirectUri) missing.push('SHAAM_REDIRECT_URI');
      
      throw new Error(
        `Missing required SHAAM environment variables: ${missing.join(', ')}. ` +
        `Please add them to your .env file. Example:\n` +
        `SHAAM_CLIENT_ID=your_client_id\n` +
        `SHAAM_CLIENT_SECRET=your_client_secret\n` +
        `SHAAM_REDIRECT_URI=http://localhost:3000/shaam/oauth/callback\n` +
        `SHAAM_ENV=tsandbox`,
      );
    }

    const env = process.env.SHAAM_ENV || 'tsandbox';
    this.urls = getShaamUrls(env);
    
    this.logger.log('SHAAM OAuth Service initialized', {
      env,
      clientId: this.clientId.substring(0, 8) + '...',
      redirectUri: this.redirectUri,
    });
  }

  /**
   * Generates a random state string for OAuth2 flow
   */
  generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Builds the OAuth2 authorization URL
   * @param state - Random state string for CSRF protection
   * @returns Authorization URL
   */
  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: SHAAM_SCOPE,
      redirect_uri: this.redirectUri,
      state: state,
    });

    return `${this.urls.authorize}?${params.toString()}`;
  }

  /**
   * Exchanges authorization code for access token
   * @param code - Authorization code from callback
   * @param redirectUri - Must match the redirect_uri used in authorization
   * @returns Token response
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<ShaamTokenResponseDto> {
    if (!code) {
      throw new BadRequestException('Authorization code is required');
    }

    if (redirectUri !== this.redirectUri) {
      this.logger.warn('Redirect URI mismatch', {
        expected: this.redirectUri,
        received: redirectUri,
      });
      throw new BadRequestException('Redirect URI mismatch');
    }

    const tokenUrl = this.urls.token;
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirectUri,
      scope: SHAAM_SCOPE,
    });

    // Log token request (without secrets)
    const tokenRequestLog = {
      url: tokenUrl,
      grant_type: 'authorization_code',
      code: code.substring(0, 10) + '...',
      redirect_uri: redirectUri,
      scope: SHAAM_SCOPE,
      hasAuthHeader: true,
      authHeaderPrefix: 'Basic',
    };

    this.logger.log('Token request sent', tokenRequestLog);

    try {
      const response = await firstValueFrom(
        this.httpService.post<ShaamTokenResponseDto>(
          tokenUrl,
          body.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${credentials}`,
            },
            timeout: REQUEST_TIMEOUT_MS,
          },
        ).pipe(timeout(REQUEST_TIMEOUT_MS)),
      );

      // Log token response (with masked access_token)
      const maskedToken = response.data.access_token
        ? response.data.access_token.substring(0, 10) + '...'
        : 'N/A';
      
      const tokenResponseLog = {
        status: response.status,
        access_token: maskedToken,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        has_refresh_token: !!response.data.refresh_token,
        scope: response.data.scope,
      };

      this.logger.log('Token response received', tokenResponseLog);
      
      return response.data;
    } catch (error: any) {
      // Enhanced error logging for DNS/network issues
      const errorLog: any = {
        message: error.message,
        code: error.code,
        errno: error.errno,
        syscall: error.syscall,
        hostname: error.hostname,
      };

      // Add HTTP response details if available
      if (error.response) {
        errorLog.status = error.response.status;
        errorLog.statusText = error.response.statusText;
        errorLog.error = error.response.data?.error;
        errorLog.error_description = error.response.data?.error_description;
        errorLog.responseData = error.response.data;
      }

      // Check for DNS/network errors
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        errorLog.errorType = 'NETWORK_ERROR';
        errorLog.details = `Cannot reach SHAAM API. Check network connection, DNS resolution, or VPN/proxy settings.`;
        errorLog.targetUrl = tokenUrl;
      }

      this.logger.error('Failed to exchange code for token', errorLog);
      throw this.handleError(error, 'Token exchange failed');
    }
  }

  /**
   * Refreshes an access token using refresh token
   * @param refreshToken - The refresh token
   * @returns New token response with access_token, expires_in, and optionally new refresh_token
   */
  async refreshAccessToken(refreshToken: string): Promise<ShaamTokenResponseDto> {
    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const tokenUrl = this.urls.token;
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: SHAAM_SCOPE,
    });

    // Log refresh request (without secrets)
    const refreshRequestLog = {
      url: tokenUrl,
      grant_type: 'refresh_token',
      refresh_token: refreshToken.substring(0, 10) + '...',
      scope: SHAAM_SCOPE,
      hasAuthHeader: true,
      authHeaderPrefix: 'Basic',
    };

    this.logger.log('Refresh token request sent', refreshRequestLog);

    try {
      const response = await firstValueFrom(
        this.httpService.post<ShaamTokenResponseDto>(
          tokenUrl,
          body.toString(),
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Authorization: `Basic ${credentials}`,
            },
            timeout: REQUEST_TIMEOUT_MS,
          },
        ).pipe(timeout(REQUEST_TIMEOUT_MS)),
      );

      // Log token response (with masked access_token)
      const maskedToken = response.data.access_token
        ? response.data.access_token.substring(0, 10) + '...'
        : 'N/A';
      
      const tokenResponseLog = {
        status: response.status,
        access_token: maskedToken,
        token_type: response.data.token_type,
        expires_in: response.data.expires_in,
        has_refresh_token: !!response.data.refresh_token,
        scope: response.data.scope,
      };

      this.logger.log('Refresh token response received', tokenResponseLog);
      
      return response.data;
    } catch (error: any) {
      this.logger.error('Failed to refresh access token', {
        status: error.response?.status,
        error: error.response?.data?.error,
        error_description: error.response?.data?.error_description,
      });
      throw this.handleError(error, 'Failed to refresh access token');
    }
  }

  private handleError(error: any, defaultMessage: string): Error {
    // Handle HTTP response errors
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 400) {
        return new BadRequestException(data || defaultMessage);
      }
      
      return new Error(data?.error_description || data?.error || defaultMessage);
    }

    // Handle network/DNS errors
    if (error.code === 'ENOTFOUND') {
      return new Error(
        `DNS resolution failed for ${error.hostname}. ` +
        `Please check your network connection, DNS settings, or VPN/proxy configuration. ` +
        `Target URL: ${this.urls.token}`
      );
    }

    if (error.code === 'ECONNREFUSED') {
      return new Error(
        `Connection refused to ${error.hostname}. ` +
        `The server may be down or unreachable. ` +
        `Target URL: ${this.urls.token}`
      );
    }

    if (error.code === 'ETIMEDOUT') {
      return new Error(
        `Request timeout while connecting to ${error.hostname}. ` +
        `Please check your network connection or firewall settings. ` +
        `Target URL: ${this.urls.token}`
      );
    }
    
    return new Error(error.message || defaultMessage);
  }
}

