import { Optional } from '@nestjs/common';
import { EmailIntakeRunsService } from '../email-intake/email-intake-runs.service';
import {
  Body,
  BadRequestException,
  ConflictException,
  Controller,
  Delete,
  Get,
  ForbiddenException,
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
import { EmailConnectionsService } from './services/email-connections.service';
import { UserIntegrationsService } from './services/user-integrations.service';

/**
 * Google account connect/disconnect endpoints (Phase B), the Gmail attachment
 * reader (Phase C) and the Gmail → Drive inbox import (Phase D).
 * No document analysis here — that stays in the existing Drive-inbox flow.
 */
@Controller('integrations')
export class IntegrationsController {
  constructor(
    private readonly emailConnectionsService: EmailConnectionsService,
    private readonly userIntegrationsService: UserIntegrationsService,
    private readonly gmailReaderService: GmailReaderService,
    private readonly gmailDriveImportService: GmailDriveImportService,
    private readonly gmailSyncService: GmailSyncService,
    @Optional() private readonly durableRuns?: EmailIntakeRunsService,
  ) {}

  private ownerId(request: AuthenticatedRequest): string {
    const user = request.user;
    if (!user?.firebaseId) throw new NotFoundException('User not found in request');
    if ((user.actorFirebaseId && user.actorFirebaseId !== user.firebaseId) || request.isDelegatedAccess || request.isAdminImpersonation) {
      throw new ForbiddenException('Mailbox access is available only to the account owner');
    }
    return user.firebaseId;
  }

  @Get('outlook/connect')
  @UseGuards(FirebaseAuthGuard)
  async connectOutlook(@Req() request: AuthenticatedRequest, @Query('integrationId') integrationId?: string) {
    const owner = this.ownerId(request);
    const id = integrationId === undefined ? undefined : Number(integrationId);
    if (id !== undefined && (!Number.isSafeInteger(id) || id <= 0)) throw new NotFoundException('Integration not found');
    return this.emailConnectionsService.connect(owner, id, IntegrationProvider.MICROSOFT);
  }

  @Get('outlook/callback')
  async outlookCallback(@Res() res: Response, @Query('connected_account_id') id?: string, @Query('status') status?: string, @Query('state') state?: string, @Query('error') error?: string) {
    const url = new URL(process.env.OUTLOOK_FRONTEND_URL || process.env.GMAIL_FRONTEND_URL || 'http://localhost:4200/settings?tab=permissions');
    try {
      await this.emailConnectionsService.complete(state || '', id || '', error ? 'failed' : status || '', IntegrationProvider.MICROSOFT);
      url.searchParams.set('outlookIntegration', 'success');
    } catch (err) {
      url.searchParams.set('outlookIntegration', 'error');
      url.searchParams.set('reason', err instanceof ConflictException ? 'account_conflict' : 'callback_failed');
    }
    return res.redirect(url.toString());
  }

  @Delete('email/:integrationId')
  @UseGuards(FirebaseAuthGuard)
  async disconnectEmail(@Req() request: AuthenticatedRequest, @Param('integrationId', ParseIntPipe) id: number) {
    await this.emailConnectionsService.disconnect(this.ownerId(request), id);
    return { id, connected: false, status: IntegrationStatus.REVOKED };
  }

  /** Returns the Google consent-screen URL the frontend should navigate to. */
  @Get('google/connect')
  @UseGuards(FirebaseAuthGuard)
  async connect(@Req() request: AuthenticatedRequest, @Query('integrationId') integrationId?: string) {
    const firebaseId = this.ownerId(request);
    if (!firebaseId) throw new NotFoundException('User not found in request');

    const targetId = integrationId === undefined ? undefined : Number(integrationId);
    if (targetId !== undefined && (!Number.isSafeInteger(targetId) || targetId <= 0)) throw new NotFoundException('Integration not found');
    return this.emailConnectionsService.connect(firebaseId, targetId);
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
    @Query('connected_account_id') connectedAccountId?: string,
    @Query('status') status?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ) {
    const frontendUrl = new URL(process.env.GMAIL_FRONTEND_URL || 'http://localhost:4200/settings?tab=permissions');
    const redirectTo = (result: string, reason?: string) => {
      frontendUrl.searchParams.set('googleIntegration', result);
      if (reason) frontendUrl.searchParams.set('reason', reason);
      return res.redirect(frontendUrl.toString());
    };
    try {
      await this.emailConnectionsService.complete(state || '', connectedAccountId || '', error ? 'failed' : status || '');
      return redirectTo('success');
    } catch (err) {
      // Do not log SDK/HTTP errors: they can include tokens and signed URLs.
      return redirectTo('error', err instanceof ConflictException ? 'account_conflict' : 'callback_failed');
    }
  }

  /** All visible Google accounts (ACTIVE + EXPIRED) of the current user for the
   * settings UI. REVOKED accounts the user disconnected are excluded. */
  @Get('google/status')
  @UseGuards(FirebaseAuthGuard)
  async status(@Req() request: AuthenticatedRequest) {
    const firebaseId = this.ownerId(request);
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
    const firebaseId = this.ownerId(request);
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
      matchedByPdfContent: result.matchedByPdfContent,
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
        matchedBy: a.matchedBy,
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
    const firebaseId = this.ownerId(request);
    if (!firebaseId) throw new NotFoundException('User not found in request');

    // Imports from the Gmail accounts the user selected in the manual import
    // dialog (ownership + ACTIVE status validated in the service); one failing
    // mailbox does not abort the others (aggregated per-account in the response).
    const hasDates = body.fromDate != null || body.toDate != null;
    if (hasDates && (!body.fromDate || !body.toDate || body.q != null)) {
      throw new BadRequestException('Provide both fromDate and toDate without a Gmail query override');
    }
    const query = hasDates
      ? this.gmailSyncService.buildDateRangeQuery(body.fromDate, body.toDate)
      : body.q;
    if(this.durableRuns?.enabled())return this.durableRuns.startManual(firebaseId,body.integrationIds,{businessNumber:body.businessNumber?.trim(),query});
    return this.gmailDriveImportService.importAllForUser(firebaseId, body.integrationIds, {
      // Optional: when omitted, DocumentImportService resolves the target
      // business via BusinessResolverService.
      businessNumber: body.businessNumber?.trim() || undefined,
      query,
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
    const firebaseId = this.ownerId(request);
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
    const firebaseId = this.ownerId(request);
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
    const firebaseId = this.ownerId(request);
    if (!firebaseId) throw new NotFoundException('User not found in request');

    const row = await this.userIntegrationsService.findOwnedByIdOrThrow(integrationId, firebaseId);
    if (row.provider !== IntegrationProvider.GOOGLE) throw new NotFoundException('Integration not found');
    await this.emailConnectionsService.disconnect(firebaseId, integrationId);

    return {
      id: integrationId,
      connected: false,
      provider: IntegrationProvider.GOOGLE,
      status: IntegrationStatus.REVOKED,
    };
  }
}
