import { Injectable } from '@nestjs/common';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager, IsNull } from 'typeorm';
import { ClassifiedTransactions } from 'src/transactions/classified-transactions.entity';
import { subYears } from 'date-fns';
import { BillingService } from 'src/billing/services/billing.service';
import { CatalogContextService } from 'src/bookkeeping/catalog-context.service';
import { CatalogService } from 'src/bookkeeping/catalog.service';
import {
  Delegation,
  DelegationScope,
  DelegationStatus,
} from 'src/delegation/delegation.entity';
import { ApprovalStatus, ModuleName, RecognitionType } from 'src/enum';
import { SharedService } from 'src/shared/shared.service';
import { FullTransactionCache } from 'src/transactions/full-transaction-cache.entity';
import { SlimTransaction } from 'src/transactions/slim-transaction.entity';
import { TransactionProcessingService } from 'src/transactions/transaction-processing.service';
import { ClassificationType } from 'src/transactions/enums/classification-type.enum';
import { AgentDomainError, AgentDomainService } from './agent-domain.service';
import type { AgentHarnessUser } from './agent-harness.service';

type Query = {
  businessNumber?: string;
  externalTransactionId: string;
  subCategoryId: number;
  isSingleUpdate?: boolean;
};
const fail = (code: string, detail: string): never => {
  throw new AgentDomainError(code, detail);
};
const snapshot = (cache: FullTransactionCache, slim: SlimTransaction | null) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)),
        slim
          ? Object.entries(slim).sort(([a], [b]) => a.localeCompare(b))
          : null,
      ]),
    )
    .digest('hex');

// Keep replay acknowledgements tied to the payment the user actually saw.
const sourceSnapshot = (cache: FullTransactionCache) =>
  createHash('sha256')
    .update(
      JSON.stringify([
        cache.userId,
        cache.externalTransactionId,
        cache.businessNumber,
        cache.billId,
        cache.sourceRecordId,
        cache.transactionDate,
        cache.merchantName,
        cache.note,
        cache.amount,
        cache.currency,
        cache.ilsAmount,
        cache.paymentIdentifier,
      ]),
    )
    .digest('hex');

@Injectable()
export class AgentClassificationService {
  // Proposal expires after 30 minutes. Restart/deployment invalidates outstanding
  // cards safely; prepare again. No persistent signing secret or schema required.
  private readonly key = randomBytes(32);
  constructor(
    private readonly domain: AgentDomainService,
    private readonly processing: TransactionProcessingService,
    private readonly catalog: CatalogService,
    private readonly catalogContext: CatalogContextService,
    private readonly data: DataSource,
    private readonly billing: BillingService,
    private readonly shared: SharedService,
  ) {}

  forUser(user: AgentHarnessUser) {
    return {
      prepareTransactionClassification: (query: Query) =>
        this.prepare(user, query),
      classifyTransaction: (query: {
        proposal: string;
        isSingleUpdate?: boolean;
      }) => this.apply(user, query.proposal, query.isSingleUpdate),
    };
  }

  private async authorize(user: AgentHarnessUser) {
    await this.domain.assertAccessStillHolds(user);
    if (
      user.actorFirebaseId !== user.firebaseId &&
      !user.isAdminImpersonation
    ) {
      const delegation = await this.data.getRepository(Delegation).findOne({
        where: {
          agentId: user.actorFirebaseId,
          userId: user.firebaseId,
          status: DelegationStatus.ACTIVE,
        },
      });
      if (!delegation?.scopes?.includes(DelegationScope.EXPENSES_APPROVE))
        fail(
          'CLASSIFICATION_FORBIDDEN',
          'expense classification permission is required',
        );
    }
    if (
      !(await this.billing.hasModuleAccess(
        user.firebaseId,
        ModuleName.OPEN_BANKING,
        user.isDelegatedAccess,
        user.isAdminImpersonation,
      ))
    )
      fail('CLASSIFICATION_FORBIDDEN', 'banking module unavailable');
  }

  private eligible(
    cache: FullTransactionCache,
    slim: SlimTransaction | null,
    businessNumber: string,
  ) {
    if (
      cache.businessNumber !== businessNumber ||
      (slim?.businessNumber && slim.businessNumber !== businessNumber)
    )
      fail(
        'CLASSIFICATION_FORBIDDEN',
        'transaction belongs to another business',
      );
    if (cache.confirmed || slim?.confirmed)
      fail(
        'CLASSIFICATION_BLOCKED',
        'This transaction has already been transferred to an expense (confirmed). Phase A only classifies transactions not yet transferred to expenses; this does not necessarily mean the expense itself is approved. Nothing changed.',
      );
    if (cache.isLocked || slim?.isLocked)
      fail(
        'CLASSIFICATION_BLOCKED',
        'This transaction is locked by a submitted report. Its classification cannot be changed. Nothing changed.',
      );
    if (!cache.billId)
      fail(
        'CLASSIFICATION_BLOCKED',
        'This transaction is not linked to a bank/card account. Link it to the correct account in KeepInTax before requesting classification. Nothing changed.',
      );
    if (Number(cache.amount) >= 0)
      fail(
        'CLASSIFICATION_BLOCKED',
        'Phase A supports outgoing transactions only',
      );
  }

  private async target(user: AgentHarnessUser, query: Query) {
    const { business } = await this.domain.resolveBusiness(
      user,
      query.businessNumber,
    );
    const context = await this.catalogContext.forUser(
      user.firebaseId,
      business.businessNumber,
    );
    const rows = await this.catalog.getMergedExpenseCatalog(context);
    const sub = rows.find((row) => row.id === query.subCategoryId);
    if (
      !sub ||
      (!sub.isPrivate &&
        (!sub.account || sub.approvalStatus !== ApprovalStatus.APPROVED))
    )
      fail(
        'CLASSIFICATION_CATEGORY_INVALID',
        'choose an effective, mapped category from listCategories',
      );
    const account = sub.account;
    return {
      business,
      dto: {
        externalTransactionId: query.externalTransactionId,
        businessNumber: business.businessNumber,
        subCategoryId: sub.id,
        category: sub.category.name,
        subCategory: sub.name,
        vatPercent: Number(account?.vatPercent ?? 0),
        taxPercent: Number(account?.taxPercent ?? 0),
        reductionPercent: Number(account?.reductionPercent ?? 0),
        isEquipment: !!account?.isEquipment,
        isRecognized:
          !sub.isPrivate &&
          account?.recognitionType === RecognitionType.RECOGNIZED,
        ...(account?.reportScope ? { reportScope: account.reportScope } : {}),
      },
    };
  }

  private ruleFor(
    user: AgentHarnessUser,
    cache: FullTransactionCache,
    data: Pick<EntityManager, 'getRepository'> = this.data,
  ) {
    return data.getRepository(ClassifiedTransactions).findOne({
      where: {
        userId: user.firebaseId,
        billId: cache.billId,
        transactionName: cache.merchantName,
        startDate: IsNull(),
        endDate: IsNull(),
        minAbsSum: IsNull(),
        maxAbsSum: IsNull(),
        commentPattern: IsNull(),
        commentMatchType: 'equals',
      },
    });
  }

  private ruleState(rule: ClassifiedTransactions | null) {
    return createHash('sha256')
      .update(
        JSON.stringify(
          rule
            ? Object.entries(rule).sort(([a], [b]) => a.localeCompare(b))
            : null,
        ),
      )
      .digest('hex');
  }

  private sign(payload: string) {
    return createHmac('sha256', this.key).update(payload).digest('hex');
  }

  async prepare(
    user: AgentHarnessUser,
    query: Query,
  ): Promise<{ proposal: string }> {
    await this.authorize(user);
    const { business, dto } = await this.target(user, query);
    const cache = await this.data.getRepository(FullTransactionCache).findOne({
      where: {
        userId: user.firebaseId,
        externalTransactionId: query.externalTransactionId,
      },
    });
    if (!cache) fail('CLASSIFICATION_NOT_FOUND', 'read the transaction again');
    const slim = await this.data.getRepository(SlimTransaction).findOne({
      where: {
        userId: user.firebaseId,
        externalTransactionId: query.externalTransactionId,
      },
    });
    this.eligible(cache, slim, business.businessNumber);
    const rule = await this.ruleFor(user, cache);
    const payload = JSON.stringify({
      version: 2,
      ruleSnapshot: this.ruleState(rule),
      actor: user.actorFirebaseId,
      owner: user.firebaseId,
      expires: Date.now() + 30 * 60_000,
      query: { ...query, businessNumber: business.businessNumber },
      dto,
      snapshot: snapshot(cache, slim),
      source: sourceSnapshot(cache),
      display: {
        modeChoice: true,
        isSingleUpdate: query.isSingleUpdate ?? false,
        account: cache.billName ?? String(cache.billId),
        backfillFrom: subYears(new Date(cache.transactionDate), 1)
          .toISOString()
          .slice(0, 10),
        replacesOneTime:
          slim?.classificationType === ClassificationType.ONE_TIME,
        replacesRule: rule !== null,
        businessNumber: business.businessNumber,
        businessName: business.businessName,
        date: cache.transactionDate,
        merchant: cache.merchantName,
        amount: Number(cache.amount),
        currency: cache.currency ?? 'ILS',
        currentCategory: cache.category,
        currentSubCategory: cache.subCategory,
        category: dto.category,
        subCategory: dto.subCategory,
        vatPercent: dto.vatPercent,
        taxPercent: dto.taxPercent,
        reductionPercent: dto.reductionPercent,
        isEquipment: dto.isEquipment,
        isRecognized: dto.isRecognized,
        classificationOnly:
          user.actorFirebaseId === user.firebaseId &&
          !user.isAdminImpersonation &&
          (await this.shared.isRepresentedByAccountant(user.firebaseId)),
      },
    });
    await this.authorize(user);
    return {
      proposal: JSON.stringify({ payload, signature: this.sign(payload) }),
    };
  }

  async apply(
    user: AgentHarnessUser,
    proposal: string,
    isSingleUpdate?: boolean,
  ) {
    // The only caller exposed to the model is an approval-effect tool. The
    // server persists the requested tool input; clients can submit a decision,
    // never substitute the action/input when accepting its card.
    await this.authorize(user);
    let parsed: ReturnType<typeof JSON.parse>;
    try {
      const envelope = JSON.parse(proposal);
      const expected = Buffer.from(this.sign(envelope.payload));
      const actual = Buffer.from(envelope.signature ?? '');
      if (
        actual.length !== expected.length ||
        !timingSafeEqual(actual, expected)
      )
        fail('CLASSIFICATION_STALE', 'proposal invalid; prepare again');
      parsed = JSON.parse(envelope.payload);
    } catch {
      return fail('CLASSIFICATION_STALE', 'proposal invalid; prepare again');
    }
    if (
      parsed.actor !== user.actorFirebaseId ||
      parsed.owner !== user.firebaseId ||
      parsed.expires < Date.now()
    )
      fail(
        'CLASSIFICATION_STALE',
        'proposal expired or belongs to another user; prepare again',
      );
    if (isSingleUpdate !== undefined && typeof isSingleUpdate !== 'boolean')
      fail('CLASSIFICATION_STALE', 'invalid classification mode');
    const single =
      isSingleUpdate ??
      (parsed.version === 2 ? parsed.query.isSingleUpdate ?? false : true);
    if (parsed.version !== 2 && !single)
      fail(
        'CLASSIFICATION_STALE',
        'this older card authorizes one-time classification only; prepare again',
      );
    return this.processing.classifyPendingForAgent<{
      status: 'classified' | 'already_applied';
      expenseApproved: false;
      isSingleUpdate: boolean;
      category: string;
      subCategory: string;
    }>(
      user.firebaseId,
      parsed.query.externalTransactionId,
      async (cache, slim, manager) => {
        await this.authorize(user);
        const { business, dto } = await this.target(user, parsed.query);
        this.eligible(cache, slim, business.businessNumber);
        if (sourceSnapshot(cache) !== parsed.source)
          fail(
            'CLASSIFICATION_STALE',
            'payment details changed; prepare again',
          );
        if (JSON.stringify(dto) !== JSON.stringify(parsed.dto))
          fail('CLASSIFICATION_STALE', 'catalog changed; prepare again');
        const result = {
          expenseApproved: false as const,
          isSingleUpdate: single,
          category: dto.category,
          subCategory: dto.subCategory,
          business: {
            number: business.businessNumber,
            name: business.businessName,
          },
          transaction: { ...parsed.display, isSingleUpdate: single },
        };
        const same =
          slim?.classificationType ===
            (single ? ClassificationType.ONE_TIME : ClassificationType.RULE) &&
          Object.entries(dto).every(
            ([key, value]) =>
              key === 'externalTransactionId' ||
              (slim as unknown as Record<string, unknown>)[key] === value,
          );
        const rule = single
          ? null
          : await this.ruleFor(user, cache, manager ?? this.data);
        const sameRule =
          single ||
          (rule !== null &&
            rule.id === slim?.classificationRuleId &&
            Object.entries(dto).every(
              ([key, value]) =>
                key === 'externalTransactionId' ||
                (rule as unknown as Record<string, unknown>)[key] === value,
            ));
        if (same && sameRule)
          return { result: { ...result, status: 'already_applied' as const } };
        if (!single && this.ruleState(rule) !== parsed.ruleSnapshot)
          fail('CLASSIFICATION_STALE', 'merchant rule changed; prepare again');
        if (snapshot(cache, slim) !== parsed.snapshot)
          fail('CLASSIFICATION_STALE', 'transaction changed; prepare again');
        return { dto, result: { ...result, status: 'classified' as const } };
      },
      single,
    );
  }
}
