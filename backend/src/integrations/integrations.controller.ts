import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { GmailImportDto } from './dto/gmail-import.dto';
import { IntegrationProvider, IntegrationStatus } from './enums/integrations.enums';
import { GmailDriveImportService } from './services/gmail-drive-import.service';
import { GmailReaderService } from './services/gmail-reader.service';
import { GoogleOauthService } from './services/google-oauth.service';
import { OauthStateService } from './services/oauth-state.service';
import { UserIntegrationsService } from './services/user-integrations.service';

/**
 * Google account connect/disconnect endpoints (Phase B), the Gmail attachment
 * reader (Phase C) and the Gmail → Drive inbox import (Phase D).
 * No document analysis here — that stays in the existing Drive-inbox flow.
 */
@Controller('integrations')
export class IntegrationsController {
  private readonly logger = new Logger(IntegrationsController.name);

  constructor(
    private readonly googleOauthService: GoogleOauthService,
    private readonly oauthStateService: OauthStateService,
    private readonly userIntegrationsService: UserIntegrationsService,
    private readonly gmailReaderService: GmailReaderService,
    private readonly gmailDriveImportService: GmailDriveImportService,
  ) {}

  /** Returns the Google consent-screen URL the frontend should navigate to. */
  @Get('google/connect')
  @UseGuards(FirebaseAuthGuard)
  async connect(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');

    const state = await this.oauthStateService.createState(firebaseId, IntegrationProvider.GOOGLE);
    return { url: this.googleOauthService.buildAuthorizeUrl(state) };
  }

  /**
   * Google redirects the browser here after consent — no Firebase auth header
   * is present, so the user is identified via the single-use OAuth state.
   * Always redirects back to the frontend with a success/error query param
   * (SHAAM callback pattern); tokens never leave the backend.
   */
  @Get('google/callback')
  async callback(
    @Res() res: Response,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:4200';
    const redirectTo = (result: string, reason?: string) =>
      res.redirect(
        `${frontendUrl}/?googleIntegration=${result}` +
          (reason ? `&reason=${encodeURIComponent(reason)}` : ''),
      );

    // User canceled on the consent screen (or Google reported an error).
    if (error) {
      this.logger.warn(`Google OAuth callback returned error: ${error}`);
      return redirectTo('error', error);
    }

    try {
      const { firebaseId } = await this.oauthStateService.consumeState(
        state ?? '',
        IntegrationProvider.GOOGLE,
      );

      if (!code) {
        return redirectTo('error', 'missing_code');
      }

      const tokens = await this.googleOauthService.exchangeCode(code);
      if (!tokens.refreshToken) {
        // Should not happen with prompt=consent, but without a refresh token
        // the integration would be unusable — fail loudly instead of storing it.
        this.logger.error('Google token exchange returned no refresh token');
        return redirectTo('error', 'no_refresh_token');
      }

      await this.userIntegrationsService.upsertIntegration({
        firebaseId,
        provider: IntegrationProvider.GOOGLE,
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        accountId: tokens.accountId,
        accountEmail: tokens.accountEmail,
        scopes: tokens.scopes,
        expiresAt: tokens.expiresAt,
      });

      return redirectTo('success');
    } catch (err: any) {
      this.logger.error(`Google OAuth callback failed: ${err?.message ?? err}`, err?.stack);
      return redirectTo('error', 'callback_failed');
    }
  }

  /** Connection state for the current user, for the future settings UI. */
  @Get('google/status')
  @UseGuards(FirebaseAuthGuard)
  async status(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');

    const integration = await this.userIntegrationsService.findByUserAndProvider(
      firebaseId,
      IntegrationProvider.GOOGLE,
    );

    if (!integration) {
      return { connected: false, provider: IntegrationProvider.GOOGLE };
    }

    return {
      connected: integration.status === IntegrationStatus.ACTIVE,
      provider: integration.provider,
      accountEmail: integration.accountEmail,
      status: integration.status,
      // updatedAt reflects the most recent (re-)connect via upsertIntegration.
      connectedAt: integration.updatedAt,
    };
  }

  /**
   * Phase C test endpoint: searches the connected Gmail account for messages
   * with attachments (default: has:attachment newer_than:90d) and returns the
   * downloaded files as base64. Later phases upload these to Drive instead of
   * returning content.
   */
  @Get('google/gmail/attachments')
  @UseGuards(FirebaseAuthGuard)
  async gmailAttachments(
    @Req() request: AuthenticatedRequest,
    @Query('q') q?: string,
    @Query('maxResults') maxResults?: string,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');

    const parsedMax = maxResults ? parseInt(maxResults, 10) : undefined;
    const result = await this.gmailReaderService.fetchAttachments(firebaseId, {
      query: q,
      maxResults: Number.isFinite(parsedMax) ? parsedMax : undefined,
    });

    // Serialize Buffers only at the API edge; internally attachments stay
    // binary so the future Drive-import phase can reuse them without decoding.
    return {
      query: result.query,
      messagesFound: result.messagesFound,
      messagesWithAttachments: result.messagesWithAttachments,
      attachmentsFound: result.attachmentsFound,
      skippedWithoutFilename: result.skippedWithoutFilename,
      skippedIrrelevant: result.skippedIrrelevant,
      attachments: result.attachments.map((a) => ({
        messageId: a.messageId,
        threadId: a.threadId,
        subject: a.subject,
        from: a.from,
        date: a.date,
        attachmentId: a.attachmentId,
        filename: a.filename,
        mimeType: a.mimeType,
        size: a.size,
        contentBase64: a.content.toString('base64'),
      })),
    };
  }

  /**
   * Phase D: import Gmail attachment candidates into the business's Drive
   * inbox/ folder via the shared DocumentImportService pipeline. Documents
   * already in the system (tracked in imported_documents) are skipped; the
   * response summarizes what happened per file. Claude analysis is NOT
   * triggered here — it keeps running from the Drive inbox as before.
   */
  @Post('google/gmail/import')
  @UseGuards(FirebaseAuthGuard)
  async gmailImport(
    @Req() request: AuthenticatedRequest,
    @Body() body: GmailImportDto,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');

    return this.gmailDriveImportService.importFromGmail(firebaseId, {
      businessNumber: body.businessNumber.trim(),
      query: body.q,
      maxResults: body.maxResults,
    });
  }

  /**
   * Disconnect: best-effort revoke at Google, then clear stored tokens and
   * mark the integration REVOKED. The database row is kept.
   */
  @Delete('google')
  @UseGuards(FirebaseAuthGuard)
  async disconnect(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');

    const integration = await this.userIntegrationsService.findByUserAndProvider(
      firebaseId,
      IntegrationProvider.GOOGLE,
    );
    if (!integration) {
      throw new NotFoundException('No Google integration found for this user');
    }

    if (integration.refreshToken) {
      const refreshToken = this.userIntegrationsService.getDecryptedRefreshToken(integration);
      await this.googleOauthService.revokeToken(refreshToken);
    }

    await this.userIntegrationsService.disconnect(integration.id);

    return { connected: false, provider: IntegrationProvider.GOOGLE, status: IntegrationStatus.REVOKED };
  }
}
