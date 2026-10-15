import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { ReportsService, UniformFileArtifacts } from '../../reports/reports.service';
import { ShaamEnvironment } from '../shaam.constants';
import { UniformFileSubmission } from '../entities/uniform-file-submission.entity';
import {
  UniformFileRemoteStatus,
  UniformFileSubmissionState,
} from '../entities/shaam.enums';
import {
  UniformFileStatusResult,
  UniformFileUploadService,
} from '../uniform-file/uniform-file-upload.service';

export interface PrepareUniformFileSubmissionInput {
  businessId: number;
  businessNumber: string;
  ownerFirebaseId: string;
  actorFirebaseId: string;
  environment: ShaamEnvironment;
  periodStart: string;
  periodEnd: string;
}

export interface UniformFileSubmissionView {
  id: number;
  businessNumber: string;
  environment: ShaamEnvironment;
  periodStart: string;
  periodEnd: string;
  state: UniformFileSubmissionState;
  iniStatus: UniformFileRemoteStatus | null;
  bkmStatus: UniformFileRemoteStatus | null;
  errorCategory: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  iniByteLength: string;
  bkmByteLength: string;
  generatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  reused: boolean;
}

interface GeneratedPair {
  artifacts: UniformFileArtifacts;
  iniSha256: string;
  bkmSha256: string;
  generatedAt: Date;
}

@Injectable()
export class UniformFileSubmissionService {
  constructor(
    @InjectRepository(UniformFileSubmission)
    private readonly repo: Repository<UniformFileSubmission>,
    private readonly reports: ReportsService,
    private readonly uploads: UniformFileUploadService,
  ) {}

  async prepare(input: PrepareUniformFileSubmissionInput): Promise<UniformFileSubmissionView> {
    this.assertPeriod(input.periodStart, input.periodEnd);

    const latest = await this.repo.findOne({
      where: {
        businessId: input.businessId,
        environment: input.environment,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
      },
      order: { generatedAt: 'DESC', id: 'DESC' },
    });

    if (latest) {
      const regenerated = await this.generate(input, new Date(latest.generatedAt));
      if (
        regenerated.iniSha256 === latest.iniSha256 &&
        regenerated.bkmSha256 === latest.bkmSha256
      ) {
        return this.toView(latest, true);
      }
    }

    const generatedAt = this.nextGenerationTimestamp(latest?.generatedAt);
    const generated = await this.generate(input, generatedAt);
    const submission = this.repo.create({
      businessId: input.businessId,
      businessNumberSnapshot: input.businessNumber,
      actorFirebaseId: input.actorFirebaseId,
      environment: input.environment,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      representorCompanyId: null,
      state: UniformFileSubmissionState.GENERATED,
      iniStatus: null,
      bkmStatus: null,
      iniSha256: generated.iniSha256,
      bkmSha256: generated.bkmSha256,
      iniByteLength: String(generated.artifacts.iniBuffer.length),
      bkmByteLength: String(generated.artifacts.bkmvdataBuffer.length),
      shaamUniqueId: null,
      iniFileName: null,
      bkmFileName: null,
      iniFileUniqueId: null,
      bkmFileUniqueId: null,
      errorCategory: null,
      errorCode: null,
      errorMessage: null,
      retryCount: 0,
      generatedAt,
      uploadedAt: null,
      lastPolledAt: null,
      completedAt: null,
    });

    try {
      return this.toView(await this.repo.save(submission), false);
    } catch (error: any) {
      if (!this.isDuplicate(error)) throw error;
      const concurrent = await this.repo.findOne({
        where: {
          environment: input.environment,
          businessId: input.businessId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          iniSha256: generated.iniSha256,
          bkmSha256: generated.bkmSha256,
        },
      });
      if (!concurrent) throw error;
      return this.toView(concurrent, true);
    }
  }

  async status(businessId: number, submissionId: number): Promise<UniformFileSubmissionView> {
    const submission = await this.repo.findOne({
      where: { id: submissionId, businessId },
    });
    if (!submission) throw new NotFoundException('Uniform-file submission not found');
    return this.toView(submission, false);
  }

  async transfer(
    businessId: number,
    submissionId: number,
    ownerFirebaseId: string,
    accessToken: string,
  ): Promise<UniformFileSubmissionView> {
    let submission = await this.findScoped(businessId, submissionId);
    if (submission.iniFileUniqueId || submission.bkmFileUniqueId) {
      return this.pollLoaded(submission, accessToken);
    }
    if (
      ![
        UniformFileSubmissionState.GENERATED,
        UniformFileSubmissionState.AUTH_REQUIRED,
        UniformFileSubmissionState.RETRYABLE_FAILURE,
      ].includes(submission.state)
    ) {
      if (submission.state === UniformFileSubmissionState.LINKS_RESERVED) {
        await this.fail(submission, UniformFileSubmissionState.UNKNOWN_OUTCOME, 'INTERRUPTED',
          'Upload-link reservation outcome is unknown');
      }
      throw new ConflictException('Uniform-file submission cannot reserve new links');
    }

    const generated = await this.generate(
      {
        businessId: submission.businessId,
        businessNumber: submission.businessNumberSnapshot,
        ownerFirebaseId,
        actorFirebaseId: submission.actorFirebaseId,
        environment: submission.environment,
        periodStart: submission.periodStart,
        periodEnd: submission.periodEnd,
      },
      new Date(submission.generatedAt),
    );
    this.assertStoredArtifact(submission, generated);

    const claimed = await this.repo.update(
      {
        id: submission.id,
        businessId,
        state: submission.state,
        shaamUniqueId: IsNull(),
      },
      {
        state: UniformFileSubmissionState.LINKS_RESERVED,
        errorCategory: null,
        errorCode: null,
        errorMessage: null,
      },
    );
    if (claimed.affected !== 1) {
      submission = await this.findScoped(businessId, submissionId);
      if (submission.iniFileUniqueId || submission.bkmFileUniqueId) {
        return this.pollLoaded(submission, accessToken);
      }
      throw new ConflictException('Uniform-file submission is already being transferred');
    }
    submission.state = UniformFileSubmissionState.LINKS_RESERVED;

    try {
      const reservation = await this.uploads.reserveUploadLinks(accessToken, {
        caseNumber: submission.businessNumberSnapshot,
        startPeriod: submission.periodStart,
        endPeriod: submission.periodEnd,
        ...(submission.representorCompanyId
          ? { representorCompanyId: submission.representorCompanyId }
          : {}),
      });
      submission.shaamUniqueId = reservation.uniqueId;
      submission.iniFileName = reservation.ini.fileName;
      submission.bkmFileName = reservation.bkm.fileName;
      submission.iniFileUniqueId = reservation.ini.fileUniqueId;
      submission.bkmFileUniqueId = reservation.bkm.fileUniqueId;
      submission = await this.repo.save(submission);

      await this.uploads.uploadFile(reservation.ini, generated.artifacts.iniBuffer);
      submission.state = UniformFileSubmissionState.INI_UPLOADED;
      submission = await this.repo.save(submission);

      await this.uploads.uploadFile(
        reservation.bkm,
        generated.artifacts.bkmvdataBuffer,
      );
      submission.state = UniformFileSubmissionState.PAIR_UPLOADED;
      submission.uploadedAt = new Date();
      submission = await this.repo.save(submission);
      return this.pollLoaded(submission, accessToken);
    } catch (error) {
      if (submission.errorCode === 'STATUS_UNAVAILABLE') throw error;
      const ambiguous = error instanceof ServiceUnavailableException;
      await this.fail(
        submission,
        ambiguous
          ? UniformFileSubmissionState.UNKNOWN_OUTCOME
          : UniformFileSubmissionState.RETRYABLE_FAILURE,
        ambiguous ? 'AMBIGUOUS_EXTERNAL_OUTCOME' : 'EXTERNAL_REQUEST_FAILED',
        ambiguous
          ? 'SHAAM outcome is unknown; poll before retrying'
          : 'SHAAM transfer failed',
      );
      throw error;
    }
  }

  async poll(
    businessId: number,
    submissionId: number,
    accessToken: string,
  ): Promise<UniformFileSubmissionView> {
    return this.pollLoaded(await this.findScoped(businessId, submissionId), accessToken);
  }

  private async pollLoaded(
    submission: UniformFileSubmission,
    accessToken: string,
  ): Promise<UniformFileSubmissionView> {
    if (
      submission.state === UniformFileSubmissionState.APPROVED ||
      submission.state === UniformFileSubmissionState.REJECTED
    ) {
      return this.toView(submission, false);
    }
    if (!submission.iniFileUniqueId || !submission.bkmFileUniqueId) {
      throw new ConflictException('Uniform-file submission has no remote file identifiers');
    }
    try {
      const statuses = await this.uploads.getFileStatuses(accessToken, [
        submission.iniFileUniqueId,
        submission.bkmFileUniqueId,
      ]);
      const ini = statuses.find((item) => item.fileName === submission.iniFileUniqueId);
      const bkm = statuses.find((item) => item.fileName === submission.bkmFileUniqueId);
      if (!ini || !bkm) throw new ConflictException('SHAAM file statuses are incomplete');
      this.applyRemoteStatuses(submission, ini, bkm);
      submission.lastPolledAt = new Date();
      return this.toView(await this.repo.save(submission), false);
    } catch (error) {
      if (!(error instanceof ConflictException)) {
        await this.fail(
          submission,
          UniformFileSubmissionState.UNKNOWN_OUTCOME,
          'STATUS_UNAVAILABLE',
          'SHAAM file status is temporarily unavailable',
        );
      }
      throw error;
    }
  }

  private async generate(
    input: PrepareUniformFileSubmissionInput,
    generatedAt: Date,
  ): Promise<GeneratedPair> {
    const uniqueId = this.deriveUniqueId(input, generatedAt);
    const artifacts = await this.reports.createUniformFile(
      input.ownerFirebaseId,
      input.periodStart,
      input.periodEnd,
      input.businessNumber,
      { uniqueId, generatedAt },
    );
    return {
      artifacts,
      iniSha256: this.sha256(artifacts.iniBuffer),
      bkmSha256: this.sha256(artifacts.bkmvdataBuffer),
      generatedAt,
    };
  }

  private deriveUniqueId(
    input: PrepareUniformFileSubmissionInput,
    generatedAt: Date,
  ): string {
    const seed = [
      input.environment,
      input.businessId,
      input.businessNumber,
      input.periodStart,
      input.periodEnd,
      generatedAt.toISOString(),
    ].join('|');
    const digest = createHash('sha256').update(seed, 'utf8').digest('hex');
    // Twelve hex digits fit safely inside JavaScript's integer precision. The
    // offset guarantees an exact 15-digit decimal identifier.
    return String(parseInt(digest.slice(0, 12), 16) + 100000000000000);
  }

  private sha256(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex');
  }

  private assertStoredArtifact(
    submission: UniformFileSubmission,
    generated: GeneratedPair,
  ): void {
    if (
      generated.iniSha256 !== submission.iniSha256 ||
      generated.bkmSha256 !== submission.bkmSha256 ||
      String(generated.artifacts.iniBuffer.length) !== submission.iniByteLength ||
      String(generated.artifacts.bkmvdataBuffer.length) !== submission.bkmByteLength
    ) {
      throw new ConflictException('Prepared uniform-file artifact has changed');
    }
  }

  private applyRemoteStatuses(
    submission: UniformFileSubmission,
    ini: UniformFileStatusResult,
    bkm: UniformFileStatusResult,
  ): void {
    submission.iniStatus = this.toRemoteStatus(ini);
    submission.bkmStatus = this.toRemoteStatus(bkm);
    submission.errorCategory = null;
    submission.errorCode = null;
    submission.errorMessage = null;
    if (ini.status === 'Rejected' || bkm.status === 'Rejected') {
      submission.state = UniformFileSubmissionState.REJECTED;
      submission.completedAt = new Date();
      submission.errorCategory = 'SHAAM_REJECTED';
      submission.errorCode = ini.errorCode || bkm.errorCode || null;
      submission.errorMessage = ini.description || bkm.description || 'SHAAM rejected a file';
    } else if (ini.status === 'Approved' && bkm.status === 'Approved') {
      submission.state = UniformFileSubmissionState.APPROVED;
      submission.completedAt = new Date();
    } else {
      submission.state = UniformFileSubmissionState.PROCESSING;
      submission.completedAt = null;
    }
  }

  private toRemoteStatus(
    result: UniformFileStatusResult,
  ): UniformFileRemoteStatus | null {
    if (!result.isFound || !result.status) return null;
    if (result.status === 'Uploaded') return UniformFileRemoteStatus.UPLOADED;
    if (result.status === 'Approved') return UniformFileRemoteStatus.APPROVED;
    return UniformFileRemoteStatus.REJECTED;
  }

  private async findScoped(
    businessId: number,
    submissionId: number,
  ): Promise<UniformFileSubmission> {
    const submission = await this.repo.findOne({
      where: { id: submissionId, businessId },
    });
    if (!submission) throw new NotFoundException('Uniform-file submission not found');
    return submission;
  }

  private async fail(
    submission: UniformFileSubmission,
    state: UniformFileSubmissionState,
    code: string,
    message: string,
  ): Promise<void> {
    submission.state = state;
    submission.errorCategory = 'SHAAM_TRANSFER';
    submission.errorCode = code;
    submission.errorMessage = message;
    submission.retryCount += 1;
    await this.repo.save(submission);
  }

  private nextGenerationTimestamp(previous?: Date): Date {
    const now = new Date();
    now.setMilliseconds(0);
    if (!previous) return now;
    const previousTime = new Date(previous).getTime();
    return now.getTime() > previousTime
      ? now
      : new Date(previousTime + 1000);
  }

  private assertPeriod(start: string, end: string): void {
    if (!this.isCanonicalDate(start) || !this.isCanonicalDate(end)) {
      throw new BadRequestException('Uniform-file period must use YYYY-MM-DD');
    }
    const startTime = Date.parse(`${start}T00:00:00Z`);
    const endTime = Date.parse(`${end}T00:00:00Z`);
    if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || startTime > endTime) {
      throw new BadRequestException('Invalid uniform-file period');
    }
  }

  private isCanonicalDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }

  private isDuplicate(error: any): boolean {
    return error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062;
  }

  private toView(
    submission: UniformFileSubmission,
    reused: boolean,
  ): UniformFileSubmissionView {
    return {
      id: submission.id,
      businessNumber: submission.businessNumberSnapshot,
      environment: submission.environment,
      periodStart: submission.periodStart,
      periodEnd: submission.periodEnd,
      state: submission.state,
      iniStatus: submission.iniStatus,
      bkmStatus: submission.bkmStatus,
      errorCategory: submission.errorCategory,
      errorCode: submission.errorCode,
      errorMessage: submission.errorMessage,
      iniByteLength: submission.iniByteLength,
      bkmByteLength: submission.bkmByteLength,
      generatedAt: submission.generatedAt,
      createdAt: submission.createdAt,
      updatedAt: submission.updatedAt,
      reused,
    };
  }
}
