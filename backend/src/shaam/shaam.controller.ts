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
} from '@nestjs/common';
import { Response } from 'express';
import { ShaamOauthService } from './services/shaam-oauth.service';
import { ShaamInvoicesService } from './services/shaam-invoices.service';
import { ShaamApprovalDto } from './dto/shaam-approval.dto';

@Controller('shaam')
export class ShaamController {
  constructor(
    private readonly oauthService: ShaamOauthService,
    private readonly invoicesService: ShaamInvoicesService,
  ) {}


  @Get('oauth/redirect')
  redirectToAuthorize(@Res() res: Response) {
    const state = this.oauthService.generateState();
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
    // Log callback hit
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

      // Always redirect to frontend with full token response (browser flow)
      // Send full response as JSON-encoded query parameter
      const fullResponse = {
        access_token: tokenResponse.access_token,
        token_type: tokenResponse.token_type,
        expires_in: tokenResponse.expires_in,
        refresh_token: tokenResponse.refresh_token || null,
        scope: tokenResponse.scope || null,
      };
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
    const maskedToken = accessToken.substring(0, 10) + '...';
    console.log('Extracted access token:', maskedToken);
    console.log('Token length:', accessToken.length);
    console.log('Invoice ID:', approvalDto.invoice_id);
    console.log('=== END APPROVAL REQUEST LOG ===');

    const result = await this.invoicesService.submitApproval(
      accessToken,
      approvalDto,
    );

    return result;
  }
}

