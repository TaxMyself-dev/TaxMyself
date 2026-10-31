import { createHash } from 'crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Business } from '../../business/business.entity';
import { ReportsService } from '../../reports/reports.service';
import { UniformFileSubmission } from '../entities/uniform-file-submission.entity';
import {
  ShaamProduct,
  UniformFileRemoteStatus,
  UniformFileSubmissionState,
} from '../entities/shaam.enums';
import { ShaamEnvironment } from '../shaam.constants';
import {
  UniformFileApiService,
  UniformFileClientError,
  UniformFileStatusResult,
} from '../uniform-file/uniform-file-api.service';
import {
  UNIFORM_FILE_OAUTH_CONFIG,
  UniformFileOauthConfig,
} from '../uniform-file/uniform-file-oauth.config';
import { ShaamConnectionService } from './shaam-connection.service';

export interface UniformFileSubmissionView {
  id: number;
  state: UniformFileSubmissionState;
  periodStart: string;
  periodEnd: string;
  iniStatus: UniformFileRemoteStatus | null;
  bkmStatus: UniformFileRemoteStatus | null;
  errorCategory: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  generatedAt: Date;
  uploadedAt: Date | null;
  lastPolledAt: Date | null;
  completedAt: Date | null;
}

@Injectable()
export class UniformFileSubmissionService {
  private readonly logger = new Logger(UniformFileSubmissionService.name);

  constructor(
    @InjectRepository(UniformFileSubmission)
    private readonly repo: Repository<UniformFileSubmission>,
    private readonly reports: ReportsService,
    private readonly connections: ShaamConnectionService,
    private readonly api: UniformFileApiService,
    @Inject(UNIFORM_FILE_OAUTH_CONFIG)
    private readonly uniformConfig: UniformFileOauthConfig,
  ) {}

  async submit(
    effectiveUserId: string,
    actorFirebaseId: string,
    business: Business,
    startDate: string,
    endDate: string,
    representorCompanyId?: string,
  ): Promise<UniformFileSubmissionView> {
    this.assertDates(startDate, endDate);
    const resumable = await this.repo.findOne({
      where: {
        environment: this.uniformConfig.environment,
        businessId: business.id,
        periodStart: startDate,
        periodEnd: endDate,
      },
      order: { createdAt: 'DESC' },
    });
    if (resumable && !this.canAttemptReservation(resumable)) {
      return this.view(resumable);
    }
    const artifacts = await this.reports.createUniformFile(
      effectiveUserId,
      startDate,
      endDate,
      business.businessNumber,
    );
    let submission = await this.findOrCreate(
      business,
      actorFirebaseId,
      startDate,
      endDate,
      representorCompanyId ?? null,
      artifacts.iniBuffer,
      artifacts.bkmvdataBuffer,
      resumable ?? undefined,
    );

    if (!this.canAttemptReservation(submission)) {
      return this.view(submission);
    }
    const accessToken = await this.connections.getValidAccessToken(
      business.id,
      ShaamProduct.UNIFORM_FILE,
      this.uniformConfig.environment,
    );
    if (!accessToken) {
      submission.state = UniformFileSubmissionState.AUTH_REQUIRED;
      submission.errorCategory = 'authorization_required';
      submission.errorCode = null;
      submission.errorMessage = 'Tax Authority connection is required';
      submission = await this.repo.save(submission);
      return this.view(submission);
    }

    const replacingReconciledPair =
      submission.errorCategory === 'reconciled_not_found';
    const claimPatch: Partial<UniformFileSubmission> = {
      state: UniformFileSubmissionState.UNKNOWN_OUTCOME,
      errorCategory: 'links_reservation_in_progress',
      errorCode: null,
      errorMessage: null,
    };
    if (replacingReconciledPair) {
      Object.assign(claimPatch, {
        shaamUniqueId: null,
        iniFileName: null,
        bkmFileName: null,
        iniFileUniqueId: null,
        bkmFileUniqueId: null,
        iniStatus: null,
        bkmStatus: null,
      });
    }
    const claimed = await this.repo.update(
      { id: submission.id, state: submission.state },
      claimPatch,
    );
    if (claimed.affected !== 1) {
      return this.view(await this.loadOwned(submission.id, business.id));
    }
    Object.assign(submission, claimPatch);

    try {
      const pair = await this.api.reserveUploadLinks(accessToken, {
        caseNumber: business.businessNumber,
        startPeriod: startDate,
        endPeriod: endDate,
        representorCompanyId,
      });
      this.api.assertWithinReservedSize(pair.ini, artifacts.iniBuffer);
      this.api.assertWithinReservedSize(pair.bkm, artifacts.bkmvdataBuffer);
      Object.assign(submission, {
        state: UniformFileSubmissionState.LINKS_RESERVED,
        shaamUniqueId: pair.uniqueId,
        iniFileName: pair.ini.fileName,
        bkmFileName: pair.bkm.fileName,
        iniFileUniqueId: pair.ini.fileUniqueId,
        bkmFileUniqueId: pair.bkm.fileUniqueId,
        errorCategory: null,
        errorCode: null,
        errorMessage: null,
      });
      submission = await this.repo.save(submission);

      submission = await this.uploadOne(
        submission,
        'ini',
        pair.ini,
        artifacts.iniBuffer,
      );
      submission = await this.uploadOne(
        submission,
        'bkm',
        pair.bkm,
        artifacts.bkmvdataBuffer,
      );
      submission.state = UniformFileSubmissionState.PAIR_UPLOADED;
      submission.uploadedAt = new Date();
      submission.errorCategory = null;
      submission = await this.repo.save(submission);
      return await this.pollWithToken(submission, accessToken);
    } catch (error) {
      submission = await this.persistExternalFailure(submission, error);
      return this.view(submission);
    }
  }

  async get(
    submissionId: number,
    businessId: number,
  ): Promise<UniformFileSubmissionView> {
    return this.view(await this.loadOwned(submissionId, businessId));
  }

  async poll(
    submissionId: number,
    businessId: number,
  ): Promise<UniformFileSubmissionView> {
    const submission = await this.loadOwned(submissionId, businessId);
    if (
      submission.state === UniformFileSubmissionState.APPROVED ||
      submission.state === UniformFileSubmissionState.REJECTED
    ) {
      return this.view(submission);
    }
    if (!submission.iniFileUniqueId || !submission.bkmFileUniqueId) {
      return this.view(submission);
    }
    const accessToken = await this.connections.getValidAccessToken(
      businessId,
      ShaamProduct.UNIFORM_FILE,
      submission.environment,
    );
    if (!accessToken) {
      submission.state = UniformFileSubmissionState.AUTH_REQUIRED;
      submission.errorCategory = 'authorization_required';
      submission.errorCode = null;
      submission.errorMessage = 'Tax Authority connection is required';
      return this.view(await this.repo.save(submission));
    }
    return this.pollWithToken(submission, accessToken);
  }

  private async pollWithToken(
    submission: UniformFileSubmission,
    accessToken: string,
  ): Promise<UniformFileSubmissionView> {
    submission.state = UniformFileSubmissionState.PROCESSING;
    submission.lastPolledAt = new Date();
    submission.errorCategory = 'status_poll_in_progress';
    submission.errorCode = null;
    submission.errorMessage = null;
    submission = await this.repo.save(submission);
    try {
      const statuses = await this.api.getFileStatuses(accessToken, [
        submission.iniFileUniqueId!,
        submission.bkmFileUniqueId!,
      ]);
      this.applyStatuses(submission, statuses);
      return this.view(await this.repo.save(submission));
    } catch (error) {
      if (
        error instanceof UniformFileClientError &&
        error.category === 'authorization'
      ) {
        await this.markUniformFileReauthorizationRequired(submission);
        submission.state = UniformFileSubmissionState.AUTH_REQUIRED;
      } else {
        submission.state = UniformFileSubmissionState.PROCESSING;
      }
      submission.errorCategory = this.errorCategory(error);
      submission.errorCode = this.errorCode(error);
      submission.errorMessage = this.safeErrorMessage(error);
      return this.view(await this.repo.save(submission));
    }
  }

  private async uploadOne(
    submission: UniformFileSubmission,
    kind: 'ini' | 'bkm',
    reservation: Parameters<
      UniformFileApiService['initiateResumableUpload']
    >[0],
    buffer: Buffer,
  ): Promise<UniformFileSubmission> {
    submission.state = UniformFileSubmissionState.UNKNOWN_OUTCOME;
    submission.errorCategory = `${kind}_upload_in_progress`;
    submission.errorCode = null;
    submission.errorMessage = null;
    submission = await this.repo.save(submission);
    const sessionUrl = await this.api.initiateResumableUpload(
      reservation,
      buffer,
    );
    await this.api.uploadBuffer(sessionUrl, buffer);
    submission.state =
      kind === 'ini'
        ? UniformFileSubmissionState.INI_UPLOADED
        : UniformFileSubmissionState.PAIR_UPLOADED;
    submission.errorCategory = null;
    return this.repo.save(submission);
  }

  private applyStatuses(
    submission: UniformFileSubmission,
    statuses: UniformFileStatusResult[],
  ): void {
    const byId = new Map(
      statuses.map((status) => [status.fileUniqueId, status]),
    );
    const ini = byId.get(submission.iniFileUniqueId!);
    const bkm = byId.get(submission.bkmFileUniqueId!);
    if (!ini || !bkm) {
      throw new BadRequestException('Incomplete SHAAM status response');
    }
    submission.iniStatus = ini.status;
    submission.bkmStatus = bkm.status;
    submission.lastPolledAt = new Date();
    submission.errorCategory = null;
    submission.errorCode = null;
    submission.errorMessage = null;

    if (
      ini.status === UniformFileRemoteStatus.REJECTED ||
      bkm.status === UniformFileRemoteStatus.REJECTED
    ) {
      submission.state = UniformFileSubmissionState.REJECTED;
      submission.completedAt = new Date();
      submission.errorCategory = 'provider_rejected';
      submission.errorMessage =
        [ini.description, bkm.description].find(Boolean) ||
        'Tax Authority rejected one of the files';
      return;
    }
    if (
      ini.status === UniformFileRemoteStatus.APPROVED &&
      bkm.status === UniformFileRemoteStatus.APPROVED
    ) {
      submission.state = UniformFileSubmissionState.APPROVED;
      submission.completedAt = new Date();
      return;
    }
    if (!ini.found || !bkm.found) {
      const missing = [ini, bkm].filter((item) => !item.found);
      const conclusivelyNotFound =
        missing.length === 2 &&
        missing.every((item) => /not found/i.test(item.errorMessage || ''));
      submission.state = conclusivelyNotFound
        ? UniformFileSubmissionState.RETRYABLE_FAILURE
        : UniformFileSubmissionState.UNKNOWN_OUTCOME;
      submission.errorCategory = conclusivelyNotFound
        ? 'reconciled_not_found'
        : 'status_reconciliation_required';
      submission.errorCode = missing[0]?.errorCode || null;
      submission.errorMessage =
        missing[0]?.errorMessage ||
        'Tax Authority could not resolve both files';
      return;
    }
    submission.state = UniformFileSubmissionState.PROCESSING;
  }

  private async findOrCreate(
    business: Business,
    actorFirebaseId: string,
    periodStart: string,
    periodEnd: string,
    representorCompanyId: string | null,
    iniBuffer: Buffer,
    bkmBuffer: Buffer,
    resumable?: UniformFileSubmission,
  ): Promise<UniformFileSubmission> {
    const iniSha256 = this.hash(iniBuffer);
    const bkmSha256 = this.hash(bkmBuffer);
    const where = {
      environment: this.uniformConfig.environment,
      businessId: business.id,
      periodStart,
      periodEnd,
      iniSha256,
      bkmSha256,
    };
    if (resumable) {
      Object.assign(resumable, {
        ...where,
        actorFirebaseId,
        representorCompanyId,
        businessNumberSnapshot: business.businessNumber,
        iniByteLength: String(iniBuffer.length),
        bkmByteLength: String(bkmBuffer.length),
        generatedAt: new Date(),
      });
      return this.repo.save(resumable);
    }
    const existing = await this.repo.findOne({ where });
    if (existing) return existing;
    const created = this.repo.create({
      ...where,
      businessNumberSnapshot: business.businessNumber,
      actorFirebaseId,
      representorCompanyId,
      state: UniformFileSubmissionState.GENERATED,
      iniStatus: null,
      bkmStatus: null,
      iniByteLength: String(iniBuffer.length),
      bkmByteLength: String(bkmBuffer.length),
      generatedAt: new Date(),
    });
    try {
      return await this.repo.save(created);
    } catch (error: any) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
      const concurrent = await this.repo.findOne({ where });
      if (!concurrent) throw error;
      return concurrent;
    }
  }

  private canAttemptReservation(submission: UniformFileSubmission): boolean {
    if (
      submission.state === UniformFileSubmissionState.GENERATED ||
      submission.state === UniformFileSubmissionState.AUTH_REQUIRED
    ) {
      return !submission.shaamUniqueId;
    }
    return (
      submission.state === UniformFileSubmissionState.RETRYABLE_FAILURE &&
      (!submission.shaamUniqueId ||
        submission.errorCategory === 'reconciled_not_found')
    );
  }

  private async persistExternalFailure(
    submission: UniformFileSubmission,
    error: unknown,
  ): Promise<UniformFileSubmission> {
    const clientError =
      error instanceof UniformFileClientError ? error : undefined;
    if (clientError?.category === 'authorization') {
      await this.markUniformFileReauthorizationRequired(submission);
      submission.state = UniformFileSubmissionState.AUTH_REQUIRED;
    } else if (submission.shaamUniqueId || clientError?.ambiguous) {
      submission.state = UniformFileSubmissionState.UNKNOWN_OUTCOME;
    } else {
      submission.state = UniformFileSubmissionState.RETRYABLE_FAILURE;
    }
    submission.errorCategory = this.errorCategory(error);
    submission.errorCode = this.errorCode(error);
    submission.errorMessage = this.safeErrorMessage(error);
    return this.repo.save(submission);
  }

  private errorCategory(error: unknown): string {
    return error instanceof UniformFileClientError
      ? `${error.stage}_${error.category}`
      : 'internal_failure';
  }

  private async markUniformFileReauthorizationRequired(
    submission: UniformFileSubmission,
  ): Promise<void> {
    this.logger.warn(
      JSON.stringify({
        event: 'security_event',
        securityEvent: 'shaam_connection_reauthorization_required',
        severity: 'WARNING',
        product: ShaamProduct.UNIFORM_FILE,
        environment: submission.environment,
      }),
    );
    try {
      await this.connections.markReauthorizationRequired(
        submission.businessId,
        ShaamProduct.UNIFORM_FILE,
        submission.environment,
      );
    } catch (error: unknown) {
      this.logger.error(
        JSON.stringify({
          event: 'security_event',
          securityEvent: 'shaam_reauthorization_state_update_failed',
          severity: 'ERROR',
          product: ShaamProduct.UNIFORM_FILE,
          environment: submission.environment,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        }),
      );
    }
  }

  private errorCode(error: unknown): string | null {
    return error instanceof UniformFileClientError && error.httpStatus
      ? String(error.httpStatus)
      : null;
  }

  private safeErrorMessage(error: unknown): string {
    return error instanceof UniformFileClientError
      ? error.message
      : 'Uniform File processing failed';
  }

  private async loadOwned(
    submissionId: number,
    businessId: number,
  ): Promise<UniformFileSubmission> {
    const submission = await this.repo.findOne({
      where: { id: submissionId, businessId },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    return submission;
  }

  private assertDates(startDate: string, endDate: string): void {
    if (startDate > endDate) {
      throw new BadRequestException('startDate must not be after endDate');
    }
  }

  private hash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private view(submission: UniformFileSubmission): UniformFileSubmissionView {
    return {
      id: submission.id,
      state: submission.state,
      periodStart: submission.periodStart,
      periodEnd: submission.periodEnd,
      iniStatus: submission.iniStatus,
      bkmStatus: submission.bkmStatus,
      errorCategory: submission.errorCategory,
      errorCode: submission.errorCode,
      errorMessage: submission.errorMessage,
      generatedAt: submission.generatedAt,
      uploadedAt: submission.uploadedAt,
      lastPolledAt: submission.lastPolledAt,
      completedAt: submission.completedAt,
    };
  }
}
