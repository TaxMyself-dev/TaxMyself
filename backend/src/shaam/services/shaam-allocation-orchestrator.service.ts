import {
  BadGatewayException, BadRequestException, ConflictException, HttpException,
  Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Documents } from '../../documents/documents.entity';
import { DocumentsService } from '../../documents/documents.service';
import { DocumentStatusType, DocumentType } from '../../enum';
import { ShaamApprovalDto } from '../dto/shaam-approval.dto';
import { ShaamAllocationResolutionDto } from '../dto/shaam-document-allocation.dto';
import { REQUEST_TIMEOUT_MS, ShaamEnvironment } from '../shaam.constants';
import { ShaamInvoiceAllocationAttempt } from '../entities/shaam-invoice-allocation-attempt.entity';
import {
  ShaamInvoiceAllocationAttemptState as AttemptState,
  ShaamInvoiceAllocationResolutionAction as ResolutionAction,
} from '../entities/shaam.enums';
import { ShaamInvoicesService } from './shaam-invoices.service';

const ACCOUNTING_SOFTWARE_NUMBER = 258001;
const LEASE_BUFFER_MS = 5000;

@Injectable()
export class ShaamAllocationOrchestratorService {
  private readonly logger = new Logger(ShaamAllocationOrchestratorService.name);

  constructor(
    @InjectRepository(Documents) private readonly documentsRepo: Repository<Documents>,
    @InjectRepository(ShaamInvoiceAllocationAttempt) private readonly attemptsRepo: Repository<ShaamInvoiceAllocationAttempt>,
    private readonly dataSource: DataSource,
    private readonly invoices: ShaamInvoicesService,
    private readonly documentsService: DocumentsService,
  ) {}

  async requestAndFinalize(
    accessToken: string, effectiveFirebaseId: string, actorFirebaseId: string,
    issuerBusinessNumber: string, docNumber: string, docType: DocumentType,
  ): Promise<any> {
    const document = await this.getDocument(issuerBusinessNumber, docNumber, docType);
    if (document.allocationNum) return this.finalizeOrReturnExisting(effectiveFirebaseId, document);
    this.assertPending(document);
    const payload = this.buildApprovalPayload(document);
    const started = await this.beginAttempt(
      document.id, this.hashPayload(payload), actorFirebaseId, effectiveFirebaseId,
    );
    if (started.blockCode) this.throwBlocked(started.blockCode);
    const attempt = started.attempt!;
    this.logTransition(attempt, null, AttemptState.PROCESSING, 'approval_submit');

    try {
      const response = await this.invoices.submitApproval(accessToken, payload);
      const providerHttpStatus = response.status;
      const allocationNumber = this.extractAllocationNumber(response);
      if (response?.approved === true && !allocationNumber) {
        await this.finishFailure(attempt, AttemptState.UNKNOWN_OUTCOME, providerHttpStatus, 'malformed_success');
        this.throwBlocked('ALLOCATION_OUTCOME_UNKNOWN');
      }
      if (response?.approved === false) {
        await this.finishFailure(attempt, AttemptState.REJECTED, providerHttpStatus, 'provider_rejection');
        return { ...response, allocationState: AttemptState.REJECTED };
      }
      if (response?.approved !== true) {
        await this.finishFailure(attempt, AttemptState.UNKNOWN_OUTCOME, providerHttpStatus, 'malformed_success');
        this.throwBlocked('ALLOCATION_OUTCOME_UNKNOWN');
      }
      await this.persistApproval(
        attempt.id,
        document.id,
        allocationNumber!,
        providerHttpStatus,
      );
      // The transaction reloads its own entity instance. Mirror the persisted
      // status on the caller instance so the transition log is accurate too.
      attempt.providerHttpStatus = providerHttpStatus;
      this.logTransition(attempt, AttemptState.PROCESSING, AttemptState.APPROVED, 'approval_persisted');
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      const failure = this.classifyFailure(error);
      await this.finishFailure(attempt, failure.state, failure.httpStatus, failure.category, failure.providerErrorCode);
      if (failure.state === AttemptState.UNKNOWN_OUTCOME) this.throwBlocked('ALLOCATION_OUTCOME_UNKNOWN');
      throw error;
    }

    // Local finalization is deliberately outside the provider-call catch.
    // If PDF/upload/journal work fails, the persisted allocation remains
    // authoritative and a retry performs local work only.
    return this.documentsService.finalizeAllocation(effectiveFirebaseId, {
      issuerBusinessNumber, docNumber, docType,
    });
  }

  async getStatus(issuerBusinessNumber: string, docNumber: string, docType: DocumentType): Promise<any> {
    const document = await this.getDocument(issuerBusinessNumber, docNumber, docType);
    const latest = await this.latestAttempt(document.id);
    if (latest?.state === AttemptState.PROCESSING && this.leaseExpired(latest)) {
      await this.finishFailure(latest, AttemptState.UNKNOWN_OUTCOME, null, 'lease_expired');
      latest.state = AttemptState.UNKNOWN_OUTCOME;
    }
    const state = document.allocationNum
      ? document.docStatus === DocumentStatusType.PENDING_ALLOCATION
        ? 'ALLOCATED_LOCAL_FINALIZATION_PENDING' : 'FINALIZED'
      : latest?.state ?? 'NEVER_SENT';
    return {
      state,
      canRequest: ['NEVER_SENT', AttemptState.SAFE_TO_RETRY, AttemptState.DEFINITIVE_FAILURE].includes(state),
      canFinalizeLocally: Boolean(document.allocationNum),
      requiresAdminResolution: state === AttemptState.UNKNOWN_OUTCOME,
      requestId: latest?.requestId ?? null,
      updatedAt: latest?.updatedAt ?? null,
    };
  }

  async listUnknownAttempts(): Promise<any[]> {
    const attempts = await this.attemptsRepo.find({
      where: { state: AttemptState.UNKNOWN_OUTCOME }, relations: { document: true }, order: { createdAt: 'ASC' },
    });
    return attempts.map((attempt) => ({
      attemptId: attempt.id, requestId: attempt.requestId,
      issuerBusinessNumber: attempt.document.issuerBusinessNumber,
      docNumber: attempt.document.docNumber, docType: attempt.document.docType,
      state: attempt.state, environment: attempt.environment,
      submittedAt: attempt.submittedAt, unknownSince: attempt.unknownSince,
      httpStatus: attempt.providerHttpStatus, failureCategory: attempt.failureCategory,
      providerErrorCode: attempt.providerErrorCode,
    }));
  }

  async resolveUnknown(attemptId: number, actorFirebaseId: string, dto: ShaamAllocationResolutionDto): Promise<{ state: AttemptState }> {
    const result = await this.dataSource.transaction(async (manager) => {
      const attemptRepo = manager.getRepository(ShaamInvoiceAllocationAttempt);
      const attempt = await attemptRepo.findOne({ where: { id: attemptId }, lock: { mode: 'pessimistic_write' } });
      if (!attempt) throw new NotFoundException('Allocation attempt not found');
      if (attempt.state !== AttemptState.UNKNOWN_OUTCOME) {
        throw new ConflictException({ code: 'ALLOCATION_ATTEMPT_NOT_UNKNOWN', message: 'Only an unknown attempt can be resolved' });
      }
      const now = new Date();
      attempt.resolutionAction = dto.action;
      attempt.resolutionEvidence = dto.evidenceReference;
      attempt.resolvedByFirebaseId = actorFirebaseId;
      attempt.resolvedAt = now;
      attempt.completedAt = now;
      if (dto.action === ResolutionAction.CONFIRMED_NOT_ACCEPTED) {
        if (dto.allocationNumber) throw new BadRequestException('allocationNumber is not allowed for this action');
        attempt.state = AttemptState.SAFE_TO_RETRY;
      } else {
        if (!dto.allocationNumber) throw new BadRequestException('allocationNumber is required');
        const document = await manager.getRepository(Documents).findOne({
          where: { id: attempt.documentId }, lock: { mode: 'pessimistic_write' },
        });
        if (!document) throw new NotFoundException('Document not found');
        if (document.allocationNum && document.allocationNum !== dto.allocationNumber) {
          throw new ConflictException('Document already has a different allocation number');
        }
        document.allocationNum = dto.allocationNumber;
        await manager.getRepository(Documents).save(document);
        attempt.state = AttemptState.APPROVED_MANUAL;
      }
      await attemptRepo.save(attempt);
      return attempt;
    });
    this.logTransition(result, AttemptState.UNKNOWN_OUTCOME, result.state, 'admin_resolution');
    return { state: result.state };
  }

  private async beginAttempt(
    documentId: number, payloadSha256: string, actorFirebaseId: string, effectiveFirebaseId: string,
  ): Promise<{ attempt?: ShaamInvoiceAllocationAttempt; blockCode?: string }> {
    return this.dataSource.transaction(async (manager) => {
      const document = await manager.getRepository(Documents).findOne({
        where: { id: documentId }, lock: { mode: 'pessimistic_write' },
      });
      if (!document) throw new NotFoundException('Persisted invoice not found');
      if (document.allocationNum) return { blockCode: 'ALLOCATION_ALREADY_PERSISTED' };
      this.assertPending(document);
      const repo = manager.getRepository(ShaamInvoiceAllocationAttempt);
      const latest = await repo.findOne({
        where: { documentId }, order: { attemptNumber: 'DESC' }, lock: { mode: 'pessimistic_write' },
      });
      if (latest?.state === AttemptState.PROCESSING) {
        if (!this.leaseExpired(latest)) return { blockCode: 'ALLOCATION_REQUEST_IN_PROGRESS' };
        latest.state = AttemptState.UNKNOWN_OUTCOME;
        latest.unknownSince = new Date();
        latest.leaseExpiresAt = null;
        latest.failureCategory = 'lease_expired';
        await repo.save(latest);
        this.logTransition(latest, AttemptState.PROCESSING, AttemptState.UNKNOWN_OUTCOME, 'lease_expired');
        return { blockCode: 'ALLOCATION_OUTCOME_UNKNOWN' };
      }
      if (latest && ![AttemptState.SAFE_TO_RETRY, AttemptState.DEFINITIVE_FAILURE].includes(latest.state)) {
        return { blockCode: latest.state === AttemptState.UNKNOWN_OUTCOME ? 'ALLOCATION_OUTCOME_UNKNOWN' : 'ALLOCATION_ATTEMPT_TERMINAL' };
      }
      if (latest && latest.payloadSha256 !== payloadSha256) return { blockCode: 'ALLOCATION_DOCUMENT_CHANGED' };
      const now = new Date();
      const attempt = repo.create({
        documentId, attemptNumber: (latest?.attemptNumber ?? 0) + 1,
        requestId: randomUUID(), actorFirebaseId, effectiveFirebaseId,
        environment: this.environment(), state: AttemptState.PROCESSING, payloadSha256,
        leaseExpiresAt: new Date(now.getTime() + REQUEST_TIMEOUT_MS + LEASE_BUFFER_MS), submittedAt: now,
        providerHttpStatus: null, failureCategory: null, providerErrorCode: null,
        unknownSince: null, completedAt: null, resolutionAction: null,
        resolutionEvidence: null, resolvedByFirebaseId: null, resolvedAt: null,
      });
      await repo.save(attempt);
      return { attempt };
    });
  }

  private async persistApproval(
    attemptId: number,
    documentId: number,
    allocationNum: string,
    providerHttpStatus: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const attemptRepo = manager.getRepository(ShaamInvoiceAllocationAttempt);
      const documentRepo = manager.getRepository(Documents);
      const attempt = await attemptRepo.findOne({ where: { id: attemptId }, lock: { mode: 'pessimistic_write' } });
      const document = await documentRepo.findOne({ where: { id: documentId }, lock: { mode: 'pessimistic_write' } });
      if (!attempt || !document) throw new NotFoundException('Allocation state disappeared');
      if (attempt.state !== AttemptState.PROCESSING) throw new ConflictException('Allocation attempt is no longer active');
      document.allocationNum = allocationNum;
      attempt.state = AttemptState.APPROVED;
      attempt.providerHttpStatus = providerHttpStatus;
      attempt.leaseExpiresAt = null;
      attempt.completedAt = new Date();
      await documentRepo.save(document);
      await attemptRepo.save(attempt);
    });
  }

  private async finishFailure(
    attempt: ShaamInvoiceAllocationAttempt, state: AttemptState, httpStatus: number | null,
    category: string, providerErrorCode: string | null = null,
  ): Promise<void> {
    const previous = attempt.state;
    attempt.state = state;
    attempt.providerHttpStatus = httpStatus;
    attempt.failureCategory = category.slice(0, 64);
    attempt.providerErrorCode = providerErrorCode;
    attempt.leaseExpiresAt = null;
    attempt.completedAt = new Date();
    attempt.unknownSince = state === AttemptState.UNKNOWN_OUTCOME ? new Date() : null;
    await this.attemptsRepo.save(attempt);
    this.logTransition(attempt, previous, state, category);
  }

  private classifyFailure(error: any): { state: AttemptState; httpStatus: number | null; category: string; providerErrorCode: string | null } {
    const status = error instanceof HttpException ? error.getStatus() : Number(error?.response?.status) || null;
    const response = error instanceof HttpException ? error.getResponse() : error?.response?.data;
    const errorId = typeof response === 'object' && response ? response['error_id'] : null;
    const providerErrorCode = this.safeProviderCode(errorId);
    if (status === 400 || status === 422) return { state: AttemptState.VALIDATION_FAILED, httpStatus: status, category: 'validation', providerErrorCode };
    if ([401, 403, 404, 406, 429].includes(status as number)) return { state: AttemptState.DEFINITIVE_FAILURE, httpStatus: status, category: 'provider_client_failure', providerErrorCode };
    return { state: AttemptState.UNKNOWN_OUTCOME, httpStatus: status, category: status && status >= 500 ? 'provider_server_failure' : 'transport_or_unknown', providerErrorCode };
  }

  private throwBlocked(code: string): never {
    const messages: Record<string, string> = {
      ALLOCATION_REQUEST_IN_PROGRESS: 'בקשת ההקצאה עדיין מתבצעת. אין לשלוח בקשה נוספת.',
      ALLOCATION_OUTCOME_UNKNOWN: 'תוצאת הבקשה לרשות המסים אינה ידועה. השליחה החוזרת חסומה עד לבירור מנהל.',
      ALLOCATION_ATTEMPT_TERMINAL: 'הבקשה הסתיימה ללא הקצאה. יש לבדוק את הסטטוס לפני ניסיון נוסף.',
      ALLOCATION_DOCUMENT_CHANGED: 'פרטי המסמך השתנו מאז הניסיון הקודם ולכן השליחה החוזרת חסומה.',
      ALLOCATION_ALREADY_PERSISTED: 'מספר ההקצאה כבר נשמר; יש להשלים את ההפקה המקומית.',
    };
    throw new ConflictException({ code, message: messages[code] ?? 'Allocation request is blocked' });
  }

  private async getDocument(issuerBusinessNumber: string, docNumber: string, docType: DocumentType): Promise<Documents> {
    const document = await this.documentsRepo.findOne({ where: { issuerBusinessNumber, docNumber, docType } });
    if (!document) throw new NotFoundException('Persisted invoice not found');
    return document;
  }
  private latestAttempt(documentId: number): Promise<ShaamInvoiceAllocationAttempt | null> {
    return this.attemptsRepo.findOne({ where: { documentId }, order: { attemptNumber: 'DESC' } });
  }
  private assertPending(document: Documents): void {
    if (document.docStatus !== DocumentStatusType.PENDING_ALLOCATION) throw new BadRequestException('Invoice is not pending allocation');
  }
  private async finalizeOrReturnExisting(userId: string, document: Documents): Promise<any> {
    if (document.docStatus === DocumentStatusType.PENDING_ALLOCATION) {
      return this.documentsService.finalizeAllocation(userId, {
        issuerBusinessNumber: document.issuerBusinessNumber, docNumber: document.docNumber, docType: document.docType,
      });
    }
    return { success: true, docType: document.docType, docNumber: document.docNumber,
      generalDocIndex: document.generalDocIndex, allocationNum: document.allocationNum,
      file: document.file, copyFile: document.copyFile, docStatus: document.docStatus, alreadyFinalized: true };
  }

  private buildApprovalPayload(document: Documents): ShaamApprovalDto {
    const vatNumber = this.requiredVatNumber(document.issuerBusinessNumber, 'issuerBusinessNumber');
    return Object.assign(new ShaamApprovalDto(), {
      user_id: vatNumber, accounting_software_number: ACCOUNTING_SOFTWARE_NUMBER,
      amount_before_discount: Number(document.sumBefDisBefVat),
      customer_vat_number: this.requiredVatNumber(document.recipientId, 'recipientId'),
      discount: Number(document.disSum || 0), invoice_date: this.toApiDate(document.docDate, 'docDate'),
      invoice_id: `KT-${document.issuerBusinessNumber}-${document.generalDocIndex}`,
      invoice_issuance_date: this.toApiDate(document.issueDate, 'issueDate'),
      invoice_reference_number: document.docNumber, invoice_type: this.toShaamInvoiceType(document.docType),
      payment_amount: Number(document.sumAftDisBefVAT),
      payment_amount_including_vat: Number(document.sumAftDisWithVAT),
      vat_amount: Number(document.vatSum), vat_number: vatNumber,
    });
  }
  private hashPayload(payload: ShaamApprovalDto): string {
    const ordered = Object.keys(payload).sort().reduce<Record<string, unknown>>((value, key) => {
      value[key] = (payload as any)[key]; return value;
    }, {});
    return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
  }
  private leaseExpired(attempt: ShaamInvoiceAllocationAttempt): boolean {
    return !attempt.leaseExpiresAt || attempt.leaseExpiresAt.getTime() <= Date.now();
  }
  private environment(): ShaamEnvironment {
    return (process.env.SHAAM_ENV || '').toLowerCase() === ShaamEnvironment.PRODUCTION
      ? ShaamEnvironment.PRODUCTION : ShaamEnvironment.TSANDBOX;
  }
  private logTransition(attempt: ShaamInvoiceAllocationAttempt, fromState: AttemptState | null, toState: AttemptState, stage: string): void {
    this.logger.log('SHAAM allocation state transition', {
      operation: 'invoice_allocation', stage, requestId: attempt.requestId, attemptId: attempt.id,
      fromState, toState, environment: attempt.environment,
      httpStatus: attempt.providerHttpStatus, failureCategory: attempt.failureCategory,
    });
  }
  private safeProviderCode(value: unknown): string | null {
    return typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(value) ? value : null;
  }
  private requiredVatNumber(value: string | null | undefined, field: string): number {
    const normalized = String(value ?? '').trim();
    if (!/^\d{9}$/.test(normalized)) throw new BadRequestException(`${field} must contain exactly 9 digits`);
    return Number(normalized);
  }
  private toApiDate(value: Date | string, field: string): string {
    const raw = String(value ?? '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) throw new BadRequestException(`${field} is invalid`);
    return [parsed.getFullYear(), String(parsed.getMonth() + 1).padStart(2, '0'), String(parsed.getDate()).padStart(2, '0')].join('-');
  }
  private toShaamInvoiceType(docType: DocumentType): number {
    if (docType === DocumentType.TAX_INVOICE) return 305;
    if (docType === DocumentType.TAX_INVOICE_RECEIPT) return 320;
    if (docType === DocumentType.CREDIT_INVOICE) return 330;
    throw new BadRequestException(`Document type ${docType} does not support allocation`);
  }
  private extractAllocationNumber(response: any): string | null {
    const value = response?.confirmation_number ?? response?.Confirmation_Number
      ?? response?.message?.confirmation_number ?? response?.message?.Confirmation_Number;
    if (value == null || String(value).trim() === '') return null;
    const normalized = String(value).trim();
    if (!/^\d{1,50}$/.test(normalized)) throw new BadGatewayException('SHAAM returned an invalid allocation number');
    return normalized;
  }
}
