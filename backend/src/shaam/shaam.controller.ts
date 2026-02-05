import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Headers,
  BadRequestException,
  UsePipes,
  ValidationPipe,
  Res,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShaamOauthService } from './services/shaam-oauth.service';
import { ShaamInvoicesService } from './services/shaam-invoices.service';
import { ShaamApprovalDto } from './dto/shaam-approval.dto';
import { Business } from '../business/business.entity';
import { BusinessService } from '../business/business.service';
import { encryptToken, decryptToken } from './utils/shaam-encryption.util';

interface StateData {
  businessNumber: string;
  timestamp: number;
}

@Controller('shaam')
export class ShaamController {
  private readonly logger = new Logger(ShaamController.name);
  // In-memory Map to store businessNumber by state (TTL: 10 minutes)
  private readonly stateToBusinessMap = new Map<string, StateData>();
  private readonly STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

  constructor(
    private readonly oauthService: ShaamOauthService,
    private readonly invoicesService: ShaamInvoicesService,
    private readonly businessService: BusinessService,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
  ) {}

  /**
   * Cleans up expired entries from the state map
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    for (const [state, data] of this.stateToBusinessMap.entries()) {
      if (now - data.timestamp > this.STATE_TTL_MS) {
        this.stateToBusinessMap.delete(state);
      }
    }
  }


  @Get('oauth/redirect')
  redirectToAuthorize(
    @Res() res: Response,
    @Query('businessNumber') businessNumber?: string,
  ) {
    // Clean up expired states
    this.cleanupExpiredStates();

    console.log('🔍 SHAAM REDIRECT TO AUTHORIZE businessNumber:', businessNumber);

    // businessNumber is required - throw fatal error if missing
    if (!businessNumber || businessNumber.trim() === '') {
      this.logger.error('FATAL: businessNumber is required for OAuth redirect');
      throw new BadRequestException('businessNumber is required for SHAAM OAuth flow');
    }

    const state = this.oauthService.generateState();
    
    // Store businessNumber in Map
    this.stateToBusinessMap.set(state, {
      businessNumber: businessNumber.trim(),
      timestamp: Date.now(),
    });
    this.logger.log(`Stored businessNumber for state: ${businessNumber.substring(0, 3)}...`);

    const url = this.oauthService.buildAuthorizeUrl(state);
    // Redirect user directly to SHAAM authorization page
    res.redirect(url);
  }
  

  @Get('oauth/callback')
  async handleCallback(
    @Res() res: Response,
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('redirect_uri') redirectUri?: string,
  ) {

    console.log('=== SHAAM CALLBACK HIT ===');
    
    // Log incoming query params
    const incomingParams = {
      code: code ? code.substring(0, 10) + '...' : 'MISSING',
      state: state || 'MISSING',
      redirect_uri: redirectUri || 'NOT_PROVIDED',
      timestamp: new Date().toISOString(),
    };
    console.log('Incoming query params:', JSON.stringify(incomingParams, null, 2));

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8100';

    if (!code) {
      console.error('ERROR: Authorization code is missing');
      const errorMsg = encodeURIComponent('Authorization code is required');
      return res.redirect(`${frontendUrl}/shaam/callback?error=missing_code&error_description=${errorMsg}`);
    }

    const redirectUriToUse = redirectUri || process.env.SHAAM_REDIRECT_URI || '';
    
    if (!redirectUriToUse) {
      console.error('ERROR: Redirect URI is not configured');
      const errorMsg = encodeURIComponent('Redirect URI is not configured');
      return res.redirect(`${frontendUrl}/shaam/callback?error=missing_redirect_uri&error_description=${errorMsg}`);
    }

    console.log('Using redirect URI:', redirectUriToUse);
    
    try {
      console.log('Starting token exchange...');
      
      const tokenResponse = await this.oauthService.exchangeCodeForToken(
        code,
        redirectUriToUse,
      );

      // Log successful response structure
      const responseStructure = {
        accessToken: tokenResponse.access_token ? tokenResponse.access_token.substring(0, 10) + '...' : 'N/A',
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in,
        hasRefreshToken: !!tokenResponse.refresh_token,
        scope: tokenResponse.scope,
      };
      
      console.log('Token exchange succeeded');
      console.log('Response structure:', JSON.stringify(responseStructure, null, 2));
      console.log('=== SHAAM CALLBACK COMPLETE ===');

      // Save tokens to Business entity if businessNumber is available
      if (state) {
        const stateData = this.stateToBusinessMap.get(state);
        if (stateData) {
          try {
            await this.saveTokensToBusiness(
              stateData.businessNumber,
              tokenResponse.access_token,
              tokenResponse.expires_in,
              tokenResponse.refresh_token || null,
            );
            // Clean up Map entry after successful save
            this.stateToBusinessMap.delete(state);
          } catch (error: any) {
            this.logger.error(`Failed to save tokens to business: ${error.message}`, error.stack);
            // Continue with redirect even if save fails
          }
        } else {
          this.logger.warn(`No businessNumber found for state: ${state.substring(0, 10)}...`);
        }
      }

      // Always redirect to frontend with full token response (browser flow)
      // Send full response as JSON-encoded query parameter
      const fullResponse = {
        access_token: tokenResponse.access_token,
        token_type: tokenResponse.token_type,
        expires_in: tokenResponse.expires_in,
        refresh_token: tokenResponse.refresh_token || null,
        scope: tokenResponse.scope || null,
      };
      console.log('Full response:', JSON.stringify(fullResponse, null, 2));
      const responseJson = encodeURIComponent(JSON.stringify(fullResponse));
      return res.redirect(`${frontendUrl}/shaam/callback?response=${responseJson}`);
    } catch (error: any) {
      console.error('Token exchange failed');
      
      // Enhanced error logging
      const errorDetails: any = {
        message: error.message,
        name: error.name,
        code: error.code,
      };

      // Add network error details
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
        errorDetails.errorType = 'NETWORK_ERROR';
        errorDetails.hostname = error.hostname;
        errorDetails.syscall = error.syscall;
        errorDetails.errno = error.errno;
        errorDetails.suggestion = 'Check network connection, DNS settings, or VPN/proxy configuration';
      }

      // Add HTTP response details if available
      if (error.response) {
        errorDetails.status = error.response.status;
        errorDetails.statusText = error.response.statusText;
        errorDetails.error = error.response.data?.error;
        errorDetails.error_description = error.response.data?.error_description;
        errorDetails.responseData = error.response.data;
      }

      console.error('Error details:', JSON.stringify(errorDetails, null, 2));
      console.log('=== SHAAM CALLBACK FAILED ===');
      
      // Always redirect to frontend with error (browser flow)
      const errorMsg = encodeURIComponent(error.message || 'Token exchange failed');
      return res.redirect(`${frontendUrl}/shaam/callback?error=token_exchange_failed&error_description=${errorMsg}`);
    }
  }

  @Post('invoices/approval')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async submitApproval(
    @Body() approvalDto: ShaamApprovalDto,
    @Headers('authorization') authorization?: string,
  ) {
    console.log('=== SHAAM INVOICE APPROVAL REQUEST ===');
    console.log('Authorization header received:', authorization ? authorization.substring(0, 20) + '...' : 'MISSING');
    
    if (!authorization) {
      throw new BadRequestException('Authorization header is required');
    }

    // Extract Bearer token
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match || !match[1]) {
      throw new BadRequestException(
        'Authorization header must be in format: Bearer <token>',
      );
    }

    const accessToken = match[1];
    const maskedToken = accessToken.substring(0, 20) + '...';
    console.log('Extracted access token:', maskedToken);
    console.log('Token length:', accessToken.length);
    console.log('Token starts with:', accessToken.substring(0, 30));
    console.log('Token ends with:', '...' + accessToken.substring(accessToken.length - 20));
    console.log('Invoice ID:', approvalDto.invoice_id);
    console.log('=== END APPROVAL REQUEST LOG ===');

    const result = await this.invoicesService.submitApproval(
      accessToken,
      approvalDto,
    );

    return result;
  }

  /**
   * Gets a valid access token for a business
   * Checks if token exists and is valid, refreshes if expired
   * @param businessNumber - Business number to find the business
   * @returns Access token or null if no connection exists
   */
  @Get('access-token')
  async getAccessToken(@Query('businessNumber') businessNumber: string): Promise<{
    accessToken: string;
    expiresIn: number;
  } | null> {
    if (!businessNumber) {
      throw new BadRequestException('businessNumber is required');
    }

    try {
      const tokenData = await this.getValidAccessTokenForBusiness(businessNumber);
      if (!tokenData) {
        return null;
      }

      return {
        accessToken: tokenData.accessToken,
        expiresIn: tokenData.expiresIn,
      };
    } catch (error: any) {
      this.logger.error(`Failed to get access token for business ${businessNumber}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Gets a valid access token for a business (internal method)
   * Checks if token exists and is valid, refreshes if expired
   * @param businessNumber - Business number to find the business
   * @returns Token data or null if no connection exists
   */
  private async getValidAccessTokenForBusiness(businessNumber: string): Promise<{
    accessToken: string;
    expiresIn: number;
  } | null> {
    // Find business by businessNumber
    const business = await this.businessService.getBusinessByNumber(businessNumber);
    if (!business) {
      this.logger.warn(`Business not found for businessNumber: ${businessNumber}`);
      return null;
    }

    // Check if tokens exist
    if (!business.shaamAccessToken || !business.shaamAccessTokenExp) {
      this.logger.log(`No SHAAM tokens found for business: ${businessNumber}`);
      return null;
    }

    try {
      // Decrypt tokens
      const accessToken = decryptToken(business.shaamAccessToken);
      const expirationTimestamp = parseInt(decryptToken(business.shaamAccessTokenExp));
      
      // Check if token is still valid (with 5 minute buffer)
      const now = Date.now();
      const bufferMs = 5 * 60 * 1000; // 5 minutes
      
      if (now < expirationTimestamp - bufferMs) {
        // Token is still valid
        const expiresIn = Math.floor((expirationTimestamp - now) / 1000);
        this.logger.log(`Access token is valid for business: ${businessNumber}, expires in ${expiresIn} seconds`);
        return {
          accessToken,
          expiresIn,
        };
      }

      // Token is expired or about to expire, try to refresh
      this.logger.log(`Access token expired for business: ${businessNumber}, attempting refresh`);
      
      if (!business.shaamRefreshToken) {
        this.logger.warn(`No refresh token available for business: ${businessNumber}`);
        return null;
      }

      // Decrypt refresh token
      const refreshToken = decryptToken(business.shaamRefreshToken);
      
      // Refresh the token
      const newTokenResponse = await this.oauthService.refreshAccessToken(refreshToken);
      
      // Save new tokens to business
      await this.saveTokensToBusiness(
        businessNumber,
        newTokenResponse.access_token,
        newTokenResponse.expires_in,
        newTokenResponse.refresh_token || refreshToken, // Use new refresh_token if provided, otherwise keep old one
      );

      this.logger.log(`Successfully refreshed access token for business: ${businessNumber}`);
      
      return {
        accessToken: newTokenResponse.access_token,
        expiresIn: newTokenResponse.expires_in,
      };
    } catch (error: any) {
      // Log detailed error information
      this.logger.error(`❌ ERROR getting/refreshing token for business ${businessNumber}:`, {
        errorMessage: error.message,
        errorStack: error.stack,
        errorName: error.name,
        hasBusiness: !!business,
        hasShaamAccessToken: !!business?.shaamAccessToken,
        hasShaamAccessTokenExp: !!business?.shaamAccessTokenExp,
        hasShaamRefreshToken: !!business?.shaamRefreshToken,
        shaamAccessTokenLength: business?.shaamAccessToken?.length,
        shaamAccessTokenExpLength: business?.shaamAccessTokenExp?.length,
        shaamRefreshTokenLength: business?.shaamRefreshToken?.length,
      });
      
      // If decryption fails, provide clear error message
      if (error.message.includes('Decryption failed')) {
        const errorDetails = `
═══════════════════════════════════════════════════════════════
❌ SHAAM TOKEN DECRYPTION FAILED
═══════════════════════════════════════════════════════════════
Business Number: ${businessNumber}
Error: ${error.message}

Possible causes:
1. SHAAM_TOKEN_ENC_KEY_B64 environment variable changed
   → Tokens were encrypted with a different key
   → Solution: Ensure SHAAM_TOKEN_ENC_KEY_B64 matches the key used when tokens were saved

2. Token format is corrupted
   → Tokens may have been modified or truncated
   → Solution: User needs to reconnect to SHAAM to get new tokens

3. Encryption key is missing or invalid
   → SHAAM_TOKEN_ENC_KEY_B64 is not set or has wrong format
   → Solution: Check environment variable configuration

⚠️  Tokens were NOT deleted from database.
⚠️  User needs to reconnect to SHAAM to get new tokens.
═══════════════════════════════════════════════════════════════
        `;
        
        this.logger.error(errorDetails);
        throw new Error(`Failed to decrypt SHAAM tokens. Please reconnect to SHAAM. Error: ${error.message}`);
      }
      
      // For other errors, throw with original message
      throw error;
    }
  }

  /**
   * Saves encrypted SHAAM tokens to Business entity
   * @param businessNumber - Business number to find the business
   * @param accessToken - Plaintext access token
   * @param expiresIn - Token expiration in seconds
   * @param refreshToken - Plaintext refresh token (nullable)
   */
  private async saveTokensToBusiness(
    businessNumber: string,
    accessToken: string,
    expiresIn: number,
    refreshToken: string | null,
  ): Promise<void> {
    if (!businessNumber) {
      this.logger.warn('Cannot save tokens: businessNumber is missing');
      return;
    }

    // Find business by businessNumber
    const business = await this.businessService.getBusinessByNumber(businessNumber);
    if (!business) {
      this.logger.error(`Business not found for businessNumber: ${businessNumber}`);
      throw new Error(`Business not found for businessNumber: ${businessNumber}`);
    }
    
    // Encrypt tokens
    const encryptedAccessToken = encryptToken(accessToken);
    
    // Calculate expiration timestamp (current time + expires_in seconds)
    const expirationTimestamp = Date.now() + (expiresIn * 1000);
    const encryptedExpiration = encryptToken(expirationTimestamp.toString());

    let encryptedRefreshToken: string | null = null;
    if (refreshToken) {
      encryptedRefreshToken = encryptToken(refreshToken);
    }

    // Update business entity
    business.shaamAccessToken = encryptedAccessToken;
    business.shaamAccessTokenExp = encryptedExpiration;
    business.shaamRefreshToken = encryptedRefreshToken;

    // Save to database
    await this.businessRepo.save(business);
    
    this.logger.log(`Successfully saved SHAAM tokens for business: ${businessNumber}`);
  }
}

