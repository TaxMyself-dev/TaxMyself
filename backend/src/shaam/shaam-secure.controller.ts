import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Logger,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Response } from 'express';
import { BusinessService } from '../business/business.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import {
  ShaamAllocationResolutionDto,
  ShaamDocumentAllocationDto,
} from './dto/shaam-document-allocation.dto';
import {
  isShaamTsandboxInvoiceBusinessAllowed,
  ShaamEnvironment,
  SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED,
} from './shaam.constants';
import { ShaamConnectionStatus, ShaamProduct } from './entities/shaam.enums';
import { ShaamConnectionService } from './services/shaam-connection.service';
import { ShaamOauthStateService } from './services/shaam-oauth-state.service';
import { ShaamOauthService } from './services/shaam-oauth.service';
import { ShaamAllocationOrchestratorService } from './services/shaam-allocation-orchestrator.service';
import { AdminGuard } from '../guards/admin.guard';
import {
  UNIFORM_FILE_OAUTH_CONFIG,
  UniformFileOauthConfig,
} from './uniform-file/uniform-file-oauth.config';
import { UniformFileOauthService } from './uniform-file/uniform-file-oauth.service';
import { CreateUniformFileSubmissionDto } from './dto/uniform-file-submission.dto';
import { UniformFileSubmissionService } from './services/uniform-file-submission.service';
import { isShaamAuthorizationRejection } from './utils/shaam-authorization-error.util';

@Controller('shaam')
export class ShaamSecureController {
  private readonly logger = new Logger(ShaamSecureController.name);

  constructor(
    private readonly businessService: BusinessService,
    private readonly states: ShaamOauthStateService,
    private readonly connections: ShaamConnectionService,
    private readonly allocationOauth: ShaamOauthService,
    private readonly uniformOauth: UniformFileOauthService,
    private readonly documentAllocation: ShaamAllocationOrchestratorService,
    private readonly uniformSubmissions: UniformFileSubmissionService,
    @Inject(UNIFORM_FILE_OAUTH_CONFIG)
    private readonly uniformConfig: UniformFileOauthConfig,
  ) {}

  @Post('oauth/authorize')
  @UseGuards(FirebaseAuthGuard)
  async authorize(
    @Req() request: any,
    @Body() body: { businessNumber: string; product: ShaamProduct },
  ): Promise<{ url: string }> {
    this.assertOwnerOnlyShaamOperation(request, 'oauth_authorize');
    const business = await this.resolveBusiness(request, body.businessNumber);
    if (
      body.product === ShaamProduct.UNIFORM_FILE &&
      !this.uniformConfig.enabled
    ) {
      throw new ServiceUnavailableException(
        'Uniform-file SHAAM OAuth is disabled',
      );
    }
    const environment = this.environmentFor(body.product);
    this.assertSandboxInvoiceBusinessAllowed(
      business.businessNumber,
      body.product,
      environment,
    );
    const state = await this.states.create(
      business.id,
      request.user.actorFirebaseId,
      body.product,
      environment,
    );
    const url =
      body.product === ShaamProduct.UNIFORM_FILE
        ? this.uniformOauth.buildAuthorizeUrl(state)
        : this.allocationOauth.buildAuthorizeUrl(state);
    return { url };
  }

  @Get('oauth/callback')
  async callback(
    @Res() response: Response,
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    const intent = await this.states.consume(state);
    const business = await this.businessService.getBusinessById(intent.businessId);
    if (!business || business.firebaseId !== intent.actorFirebaseId) {
      this.logSecurityEvent('shaam_oauth_callback_owner_mismatch', 'ERROR', {
        product: intent.product,
        environment: intent.environment,
      });
      throw new ForbiddenException('Only the business owner may connect to SHAAM');
    }
    const token =
      intent.product === ShaamProduct.UNIFORM_FILE
        ? await this.uniformOauth.exchangeCodeForDailyToken(code)
        : await this.allocationOauth.exchangeCodeForToken(
            code,
            process.env.SHAAM_REDIRECT_URI || '',
          );
    const connectionStatus = await this.connections.saveToken(
      intent.businessId,
      intent.actorFirebaseId,
      intent.product,
      intent.environment,
      token,
    );
    const frontend = process.env.FRONTEND_URL || 'http://localhost:4200';
    if (connectionStatus !== ShaamConnectionStatus.ACTIVE) {
      const params = new URLSearchParams({
        connected: 'false',
        product: intent.product,
        error: 'missing_required_scope',
        error_description:
          'The Tax Authority authorization did not grant every required scope',
      });
      return response.redirect(
        `${frontend}/shaam/callback?${params.toString()}`,
      );
    }
    return response.redirect(
      `${frontend}/shaam/callback?connected=true&product=${intent.product}`,
    );
  }

  @Get('connection-status')
  @UseGuards(FirebaseAuthGuard)
  async connectionStatus(
    @Req() request: any,
    @Query('businessNumber') businessNumber: string,
    @Query('product') product: ShaamProduct,
  ) {
    this.assertOwnerOnlyShaamOperation(request, 'connection_status');
    const business = await this.resolveBusiness(request, businessNumber);
    const environment = this.environmentFor(product);
    this.assertSandboxInvoiceBusinessAllowed(
      business.businessNumber,
      product,
      environment,
    );
    return this.connections.status(business.id, product, environment);
  }

  @Post('invoices/allocation')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async submitApproval(
    @Req() request: any,
    @Query('businessNumber') businessNumber: string,
    @Body() dto: ShaamDocumentAllocationDto,
  ) {
    this.assertOwnerOnlyShaamOperation(request, 'invoice_allocation');
    const business = await this.resolveBusiness(request, businessNumber);
    const environment = this.environmentFor(ShaamProduct.INVOICE_ALLOCATION);
    this.assertSandboxInvoiceBusinessAllowed(
      business.businessNumber,
      ShaamProduct.INVOICE_ALLOCATION,
      environment,
    );
    const token = await this.connections.getValidAccessToken(
      business.id,
      ShaamProduct.INVOICE_ALLOCATION,
      environment,
    );
    if (!token) {
      throw new HttpException(
        'SHAAM connection is required',
        HttpStatus.PRECONDITION_REQUIRED,
      );
    }
    return this.executeWithConnectionState(
      business.id,
      ShaamProduct.INVOICE_ALLOCATION,
      environment,
      () =>
        this.documentAllocation.requestAndFinalize(
          token,
          request.user.firebaseId,
          request.user.actorFirebaseId ?? request.user.firebaseId,
          business.businessNumber,
          dto.docNumber,
          dto.docType,
        ),
    );
  }

  @Get('invoices/allocation/status')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async allocationStatus(
    @Req() request: any,
    @Query('businessNumber') businessNumber: string,
    @Query() dto: ShaamDocumentAllocationDto,
  ) {
    const business = await this.resolveBusiness(request, businessNumber);
    return this.documentAllocation.getStatus(
      business.businessNumber,
      dto.docNumber,
      dto.docType,
    );
  }

  @Post('uniform-file/submissions')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async submitUniformFile(
    @Req() request: any,
    @Query('businessNumber') businessNumber: string,
    @Body() dto: CreateUniformFileSubmissionDto,
  ) {
    this.assertOwnerOnlyShaamOperation(request, 'uniform_file_submission');
    const business = await this.resolveBusiness(request, businessNumber);
    return this.uniformSubmissions.submit(
      request.user.firebaseId,
      request.user.actorFirebaseId ?? request.user.firebaseId,
      business,
      dto.startDate,
      dto.endDate,
      dto.representorCompanyId,
    );
  }

  @Get('uniform-file/submissions/:submissionId')
  @UseGuards(FirebaseAuthGuard)
  async uniformFileSubmissionStatus(
    @Req() request: any,
    @Query('businessNumber') businessNumber: string,
    @Param('submissionId', ParseIntPipe) submissionId: number,
  ) {
    const business = await this.resolveBusiness(request, businessNumber);
    return this.uniformSubmissions.get(submissionId, business.id);
  }

  @Post('uniform-file/submissions/:submissionId/poll')
  @UseGuards(FirebaseAuthGuard)
  async pollUniformFileSubmission(
    @Req() request: any,
    @Query('businessNumber') businessNumber: string,
    @Param('submissionId', ParseIntPipe) submissionId: number,
  ) {
    this.assertOwnerOnlyShaamOperation(request, 'uniform_file_poll');
    const business = await this.resolveBusiness(request, businessNumber);
    return this.uniformSubmissions.poll(submissionId, business.id);
  }

  @Get('admin/invoices/allocation/unknown')
  @UseGuards(FirebaseAuthGuard, AdminGuard)
  async listUnknownAllocationAttempts() {
    return this.documentAllocation.listUnknownAttempts();
  }

  @Post('admin/invoices/allocation/:attemptId/resolve')
  @UseGuards(FirebaseAuthGuard, AdminGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async resolveUnknownAllocation(
    @Req() request: any,
    @Param('attemptId', ParseIntPipe) attemptId: number,
    @Body() dto: ShaamAllocationResolutionDto,
  ) {
    return this.documentAllocation.resolveUnknown(
      attemptId,
      request.user.actorFirebaseId ?? request.user.firebaseId,
      dto,
    );
  }

  private async resolveBusiness(request: any, businessNumber?: string) {
    if (!businessNumber?.trim())
      throw new BadRequestException('businessNumber is required');
    const business = await this.businessService.getBusinessByNumber(
      businessNumber.trim(),
      request.user.firebaseId,
    );
    if (!business)
      throw new BadRequestException('Business not found or not authorized');
    return business;
  }

  private async executeWithConnectionState<T>(
    businessId: number,
    product: ShaamProduct,
    environment: ShaamEnvironment,
    operation: () => Promise<T>,
  ): Promise<T> {
    try {
      return await operation();
    } catch (error: unknown) {
      if (isShaamAuthorizationRejection(error)) {
        this.logSecurityEvent(
          'shaam_connection_reauthorization_required',
          'WARNING',
          { product, environment },
        );
        try {
          await this.connections.markReauthorizationRequired(
            businessId,
            product,
            environment,
          );
        } catch (stateError: unknown) {
          this.logger.error(
            JSON.stringify({
              event: 'security_event',
              securityEvent: 'shaam_reauthorization_state_update_failed',
              severity: 'ERROR',
              product,
              environment,
              errorType:
                stateError instanceof Error
                  ? stateError.constructor.name
                  : typeof stateError,
            }),
          );
        }
      }
      throw error;
    }
  }

  private assertOwnerOnlyShaamOperation(request: any, operation: string): void {
    const actorFirebaseId = request.user?.actorFirebaseId;
    const effectiveFirebaseId = request.user?.firebaseId;
    if (
      !actorFirebaseId ||
      !effectiveFirebaseId ||
      actorFirebaseId !== effectiveFirebaseId ||
      request.isDelegatedAccess === true ||
      request.isAdminImpersonation === true
    ) {
      this.logSecurityEvent('shaam_owner_only_denied', 'ERROR', { operation });
      throw new ForbiddenException('רק בעל העסק רשאי לבצע פעולות מול שע״מ');
    }
  }

  private logSecurityEvent(
    securityEvent: string,
    severity: 'WARNING' | 'ERROR',
    details: Record<string, string>,
  ): void {
    const payload = JSON.stringify({
      event: 'security_event',
      securityEvent,
      severity,
      ...details,
    });
    if (severity === 'ERROR') this.logger.error(payload);
    else this.logger.warn(payload);
  }

  private environmentFor(product: ShaamProduct): ShaamEnvironment {
    if (!Object.values(ShaamProduct).includes(product)) {
      throw new BadRequestException('Unsupported SHAAM product');
    }
    if (product === ShaamProduct.UNIFORM_FILE)
      return this.uniformConfig.environment;
    return (
      process.env.SHAAM_ENV || ShaamEnvironment.TSANDBOX
    ).toLowerCase() === ShaamEnvironment.PRODUCTION
      ? ShaamEnvironment.PRODUCTION
      : ShaamEnvironment.TSANDBOX;
  }

  private assertSandboxInvoiceBusinessAllowed(
    businessNumber: string | null | undefined,
    product: ShaamProduct,
    environment: ShaamEnvironment,
  ): void {
    if (
      product !== ShaamProduct.INVOICE_ALLOCATION ||
      environment !== ShaamEnvironment.TSANDBOX ||
      isShaamTsandboxInvoiceBusinessAllowed(businessNumber)
    ) {
      return;
    }
    throw new BadRequestException({
      code: SHAAM_TSANDBOX_BUSINESS_NOT_ALLOWED,
      message:
        'Invoice allocation in TSANDBOX is limited to the configured Tax Authority test business',
    });
  }
}
