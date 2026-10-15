import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
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
import { ShaamDocumentAllocationDto } from './dto/shaam-document-allocation.dto';
import { ShaamEnvironment } from './shaam.constants';
import { ShaamProduct } from './entities/shaam.enums';
import { ShaamConnectionService } from './services/shaam-connection.service';
import { ShaamOauthStateService } from './services/shaam-oauth-state.service';
import { ShaamOauthService } from './services/shaam-oauth.service';
import { ShaamDocumentAllocationService } from './services/shaam-document-allocation.service';
import {
  UNIFORM_FILE_OAUTH_CONFIG,
  UniformFileOauthConfig,
} from './uniform-file/uniform-file-oauth.config';
import { UniformFileOauthService } from './uniform-file/uniform-file-oauth.service';
import { PrepareUniformFileSubmissionDto } from './dto/prepare-uniform-file-submission.dto';
import { UniformFileSubmissionService } from './services/uniform-file-submission.service';

@Controller('shaam')
export class ShaamSecureController {
  constructor(
    private readonly businessService: BusinessService,
    private readonly states: ShaamOauthStateService,
    private readonly connections: ShaamConnectionService,
    private readonly allocationOauth: ShaamOauthService,
    private readonly uniformOauth: UniformFileOauthService,
    private readonly documentAllocation: ShaamDocumentAllocationService,
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
    const business = await this.resolveBusiness(request, body.businessNumber);
    if (body.product === ShaamProduct.UNIFORM_FILE && !this.uniformConfig.enabled) {
      throw new ServiceUnavailableException('Uniform-file SHAAM OAuth is disabled');
    }
    const environment = this.environmentFor(body.product);
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
    const token =
      intent.product === ShaamProduct.UNIFORM_FILE
        ? await this.uniformOauth.exchangeCodeForDailyToken(code)
        : await this.allocationOauth.exchangeCodeForToken(
            code,
            process.env.SHAAM_REDIRECT_URI || '',
          );
    await this.connections.saveToken(
      intent.businessId,
      intent.actorFirebaseId,
      intent.product,
      intent.environment,
      token,
    );
    const frontend = process.env.FRONTEND_URL || 'http://localhost:4200';
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
    const business = await this.resolveBusiness(request, businessNumber);
    return this.connections.status(
      business.id,
      product,
      this.environmentFor(product),
    );
  }

  @Post('invoices/allocation')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async submitApproval(
    @Req() request: any,
    @Query('businessNumber') businessNumber: string,
    @Body() dto: ShaamDocumentAllocationDto,
  ) {
    const business = await this.resolveBusiness(request, businessNumber);
    const token = await this.connections.getValidAccessToken(
      business.id,
      ShaamProduct.INVOICE_ALLOCATION,
      this.environmentFor(ShaamProduct.INVOICE_ALLOCATION),
    );
    if (!token) {
      throw new HttpException('SHAAM connection is required', HttpStatus.PRECONDITION_REQUIRED);
    }
    return this.documentAllocation.requestAndFinalize(
      token,
      request.user.firebaseId,
      business.businessNumber,
      dto.docNumber,
      dto.docType,
    );
  }

  @Post('invoices/allocation/recover')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async recoverApproval(
    @Req() request: any,
    @Query('businessNumber') businessNumber: string,
    @Body() dto: ShaamDocumentAllocationDto,
  ) {
    const business = await this.resolveBusiness(request, businessNumber);
    const token = await this.connections.getValidAccessToken(
      business.id,
      ShaamProduct.INVOICE_ALLOCATION,
      this.environmentFor(ShaamProduct.INVOICE_ALLOCATION),
    );
    if (!token) {
      throw new HttpException('SHAAM connection is required', HttpStatus.PRECONDITION_REQUIRED);
    }
    return this.documentAllocation.recoverAndFinalize(
      token,
      request.user.firebaseId,
      business.businessNumber,
      dto.docNumber,
      dto.docType,
    );
  }

  @Post('uniform-file/submissions')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async prepareUniformFileSubmission(
    @Req() request: any,
    @Body() dto: PrepareUniformFileSubmissionDto,
  ) {
    const business = await this.resolveBusiness(request, dto.businessNumber);
    return this.uniformSubmissions.prepare({
      businessId: business.id,
      businessNumber: business.businessNumber,
      ownerFirebaseId: request.user.firebaseId,
      actorFirebaseId: request.user.actorFirebaseId,
      environment: this.environmentFor(ShaamProduct.UNIFORM_FILE),
      periodStart: dto.startDate,
      periodEnd: dto.endDate,
    });
  }

  @Get('uniform-file/submissions/:submissionId')
  @UseGuards(FirebaseAuthGuard)
  async uniformFileSubmissionStatus(
    @Req() request: any,
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @Query('businessNumber') businessNumber: string,
  ) {
    const business = await this.resolveBusiness(request, businessNumber);
    return this.uniformSubmissions.status(business.id, submissionId);
  }

  @Post('uniform-file/submissions/:submissionId/transfer')
  @UseGuards(FirebaseAuthGuard)
  async transferUniformFileSubmission(
    @Req() request: any,
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @Query('businessNumber') businessNumber: string,
  ) {
    const business = await this.resolveBusiness(request, businessNumber);
    const token = await this.uniformFileToken(business.id);
    return this.uniformSubmissions.transfer(
      business.id,
      submissionId,
      request.user.firebaseId,
      token,
    );
  }

  @Post('uniform-file/submissions/:submissionId/poll')
  @UseGuards(FirebaseAuthGuard)
  async pollUniformFileSubmission(
    @Req() request: any,
    @Param('submissionId', ParseIntPipe) submissionId: number,
    @Query('businessNumber') businessNumber: string,
  ) {
    const business = await this.resolveBusiness(request, businessNumber);
    const token = await this.uniformFileToken(business.id);
    return this.uniformSubmissions.poll(business.id, submissionId, token);
  }

  private async uniformFileToken(businessId: number): Promise<string> {
    if (!this.uniformConfig.enabled) {
      throw new ServiceUnavailableException('Uniform-file SHAAM integration is disabled');
    }
    const token = await this.connections.getValidAccessToken(
      businessId,
      ShaamProduct.UNIFORM_FILE,
      this.environmentFor(ShaamProduct.UNIFORM_FILE),
    );
    if (!token) {
      throw new HttpException(
        'SHAAM Daily Token connection is required',
        HttpStatus.PRECONDITION_REQUIRED,
      );
    }
    return token;
  }

  private async resolveBusiness(request: any, businessNumber?: string) {
    if (!businessNumber?.trim()) throw new BadRequestException('businessNumber is required');
    const business = await this.businessService.getBusinessByNumber(
      businessNumber.trim(),
      request.user.firebaseId,
    );
    if (!business) throw new BadRequestException('Business not found or not authorized');
    return business;
  }

  private environmentFor(product: ShaamProduct): ShaamEnvironment {
    if (!Object.values(ShaamProduct).includes(product)) {
      throw new BadRequestException('Unsupported SHAAM product');
    }
    if (product === ShaamProduct.UNIFORM_FILE) return this.uniformConfig.environment;
    return (process.env.SHAAM_ENV || ShaamEnvironment.TSANDBOX).toLowerCase() ===
      ShaamEnvironment.PRODUCTION
      ? ShaamEnvironment.PRODUCTION
      : ShaamEnvironment.TSANDBOX;
  }
}
