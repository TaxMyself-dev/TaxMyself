import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Logger,
  NotFoundException,
  Param,
  ParseIntPipe,
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
import { GmailInitialImportDto } from './dto/gmail-initial-import.dto';
import { IntegrationProvider, IntegrationStatus } from './enums/integrations.enums';
import { GmailDriveImportService } from './services/gmail-drive-import.service';
import { GmailReaderService } from './services/gmail-reader.service';
import { GmailSyncService } from './services/gmail-sync.service';
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
    private readonly gmailSyncService: GmailSyncService,
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
    const frontendUrl = process.env.GMAIL_FRONTEND_URL || 'http://localhost:4200';
    // Land the user back on the settings tab that hosts the Gmail integration
    // section (Feezback consent-return pattern) — the frontend reads and then
    // strips these query params.
    const redirectTo = (result: string, reason?: string) =>
      res.redirect(
        `${frontendUrl}&googleIntegration=${result}` +
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
      if (!tokens.accountId) {
        this.logger.error('Google token exchange returned no account id (sub)');
        return redirectTo('error', 'no_account_id');
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
      // A Gmail account already linked to another KeepInTax user surfaces here
      // as a ConflictException — give the frontend a distinct reason to explain.
      if (err instanceof ConflictException) {
        this.logger.warn(`Google OAuth callback rejected: ${err.message}`);
        return redirectTo('error', 'account_linked_to_other_user');
      }
      this.logger.error(`Google OAuth callback failed: ${err?.message ?? err}`, err?.stack);
      return redirectTo('error', 'callback_failed');
    }
  }

  /** All visible Google accounts (ACTIVE + EXPIRED) of the current user for the
   * settings UI. REVOKED accounts the user disconnected are excluded. */
  @Get('google/status')
  @UseGuards(FirebaseAuthGuard)
  async status(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');

    const integrations = await this.userIntegrationsService.findAllVisibleByUserAndProvider(
      firebaseId,
      IntegrationProvider.GOOGLE,
    );

    return {
      provider: IntegrationProvider.GOOGLE,
      accounts: integrations.map((integration) => ({
        id: integration.id,
        accountEmail: integration.accountEmail,
        accountId: integration.accountId,
        status: integration.status,
        scopes: integration.scopes ? integration.scopes.split(' ') : [],
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt,
      })),
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
    @Query('integrationId', ParseIntPipe) integrationId: number,
    @Query('q') q?: string,
    @Query('maxResults') maxResults?: string,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');

    const integration = await this.userIntegrationsService.findOwnedByIdOrThrow(
      integrationId,
      firebaseId,
    );

    const parsedMax = maxResults ? parseInt(maxResults, 10) : undefined;
    const result = await this.gmailReaderService.fetchAttachments(integration, {
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
   *
   * businessNumber is optional: when omitted, the pipeline resolves the target
   * business via BusinessResolverService (single business, or the primary for
   * multi-business users).
   */
  @Post('google/gmail/import')
  @UseGuards(FirebaseAuthGuard)
  async gmailImport(
    @Req() request: AuthenticatedRequest,
    @Body() body: GmailImportDto,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');

    // Imports from EVERY connected Gmail account; one failing mailbox does not
    // abort the others (aggregated per-account in the response).
    return this.gmailDriveImportService.importAllForUser(firebaseId, {
      // Optional: when omitted, DocumentImportService resolves the target
      // business via BusinessResolverService.
      businessNumber: body.businessNumber?.trim() || undefined,
      query: body.q,
      // Default 10, DTO clamps to 25 — this endpoint stays a small manual scan.
      maxMessages: body.maxResults ?? 10,
    });
  }

  /**
   * Sync state for the settings UI: connection, initial-import progress and
   * the backend-computed date-picker bounds (minFromDate = Jan 1 of the
   * previous year; maxToDate = today). The frontend must not re-derive these.
   */
  @Get('google/gmail/sync-status')
  @UseGuards(FirebaseAuthGuard)
  async gmailSyncStatus(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');

    return this.gmailSyncService.getSyncStatus(firebaseId);
  }

  /**
   * Starts the one-time initial Gmail import over a user-chosen date range.
   * Runs in the background — returns { started: true } immediately and the
   * frontend polls sync-status until the run leaves RUNNING.
   * 409 when the initial import already completed or a sync is running.
   */
  @Post('google/gmail/import-initial')
  @UseGuards(FirebaseAuthGuard)
  async gmailImportInitial(
    @Req() request: AuthenticatedRequest,
    @Body() body: GmailInitialImportDto,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');

    return this.gmailSyncService.startInitialImport(
      firebaseId,
      body.integrationId,
      body.fromDate,
      body.toDate,
    );
  }

  /**
   * Disconnect ONE connected Google account (by integration id): best-effort
   * revoke at Google, then clear stored tokens and mark that single
   * integration REVOKED. The database row is kept. 404 when the integration
   * does not exist or belongs to another user — other accounts are untouched.
   */
  @Delete('google/:integrationId')
  @UseGuards(FirebaseAuthGuard)
  async disconnect(
    @Req() request: AuthenticatedRequest,
    @Param('integrationId', ParseIntPipe) integrationId: number,
  ) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new NotFoundException('User not found in request');

    const integration = await this.userIntegrationsService.findOwnedByIdOrThrow(
      integrationId,
      firebaseId,
    );

    if (integration.refreshToken) {
      const refreshToken = this.userIntegrationsService.getDecryptedRefreshToken(integration);
      await this.googleOauthService.revokeToken(refreshToken);
    }

    await this.userIntegrationsService.disconnect(integration.id);

    return {
      id: integration.id,
      connected: false,
      provider: integration.provider,
      status: IntegrationStatus.REVOKED,
    };
  }
}
