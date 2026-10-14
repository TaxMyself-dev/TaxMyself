import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom, timeout } from 'rxjs';
import { ShaamTokenResponseDto } from '../dto/shaam-token-response.dto';
import { REQUEST_TIMEOUT_MS } from '../shaam.constants';
import {
  UNIFORM_FILE_OAUTH_CONFIG,
  UniformFileOauthConfig,
} from './uniform-file-oauth.config';

const MAX_DAILY_TOKEN_LIFETIME_SECONDS = 12 * 60 * 60;

@Injectable()
export class UniformFileOauthService {
  constructor(
    private readonly httpService: HttpService,
    @Inject(UNIFORM_FILE_OAUTH_CONFIG)
    private readonly config: UniformFileOauthConfig,
  ) {}

  buildAuthorizeUrl(state: string): string {
    this.assertEnabled();
    if (!state) throw new BadRequestException('OAuth state is required');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      scope: this.config.scopes.join(' '),
      redirect_uri: this.config.redirectUri,
      state,
    });
    return `${this.config.authorizeUrl}?${params.toString()}`;
  }

  async exchangeCodeForDailyToken(code: string): Promise<ShaamTokenResponseDto> {
    this.assertEnabled();
    if (!code) throw new BadRequestException('Authorization code is required');

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`,
      'utf8',
    ).toString('base64');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scopes.join(' '),
    });

    try {
      const response = await firstValueFrom(
        this.httpService
          .post<ShaamTokenResponseDto>(this.config.tokenUrl, body.toString(), {
            headers: {
              Authorization: `Basic ${credentials}`,
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
            },
            timeout: REQUEST_TIMEOUT_MS,
          })
          .pipe(timeout(REQUEST_TIMEOUT_MS)),
      );
      return this.validateTokenResponse(response.data);
    } catch (error: any) {
      if (error instanceof BadGatewayException) throw error;
      const status = error?.response?.status;
      if (status === 400 || status === 401) {
        throw new BadRequestException('SHAAM rejected the authorization code');
      }
      if (!error?.response) {
        throw new ServiceUnavailableException('SHAAM OAuth is temporarily unavailable');
      }
      throw new BadGatewayException('SHAAM OAuth token exchange failed');
    }
  }

  private validateTokenResponse(data: ShaamTokenResponseDto): ShaamTokenResponseDto {
    if (
      !data ||
      typeof data.access_token !== 'string' ||
      !data.access_token ||
      !Number.isInteger(data.expires_in) ||
      data.expires_in <= 0 ||
      data.expires_in > MAX_DAILY_TOKEN_LIFETIME_SECONDS
    ) {
      throw new BadGatewayException('SHAAM returned an invalid Daily Token response');
    }

    if (data.scope) {
      const returnedScopes = new Set(data.scope.split(/\s+/).filter(Boolean));
      if (this.config.scopes.some((scope) => !returnedScopes.has(scope))) {
        throw new BadGatewayException('SHAAM Daily Token is missing a required scope');
      }
    }

    return data;
  }

  private assertEnabled(): void {
    if (!this.config.enabled) {
      throw new ServiceUnavailableException('Uniform-file SHAAM OAuth is disabled');
    }
  }
}
