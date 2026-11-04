import { FeezbackService } from './feezback.service';
import { SourceType } from '../enum';

/**
 * Focused unit tests for the Direct/Debit-card handling in FeezbackService.
 *
 * Detection rule (Feezback / Open Banking guarantee): credit cards ALWAYS
 * return balances, direct/debit cards NEVER do. isDirect is only ever written
 * from a SUCCESSFUL cards+balances fetch — never guessed on failure.
 */
describe('FeezbackService — Direct/Debit card handling', () => {
  const USER = 'user-1';
  const SUB = 'user-1_sub';

  const directCard = {
    resourceId: 'card-direct',
    maskedPan: '532612******3221',
    currency: 'ILS',
    consentId: 'consent-1',
    balances: [], // no balances → Direct card
  };

  const creditCard = {
    resourceId: 'card-credit',
    maskedPan: '532612******9999',
    currency: 'ILS',
    consentId: 'consent-1',
    balances: [{ balanceAmount: { amount: '1200.0', currency: 'ILS' }, balanceType: 'interimAvailable' }],
  };

  function makeService() {
    const feezbackApiService = {
      getUserCards: jest.fn(),
      getUserAccounts: jest.fn(),
      getUserConsents: jest.fn().mockResolvedValue({ consents: [{ resourceId: 'consent-1', consentStatus: 'valid' }] }),
    };
    const consentApi = {
      getCardTransactions: jest.fn(),
      getAccountTransactionsByConsent: jest.fn(),
    };
    const userSyncStateService = {
      getSourceResults: jest.fn().mockResolvedValue([{ sourceRecordId: 11, connectionRole: 'primary', sourceId: '3221', type: 'card' }, { sourceRecordId: 12, connectionRole: 'primary', sourceId: '9999', type: 'card' }]),
      updateSourceResults: jest.fn().mockResolvedValue(undefined),
      markCacheReadyAfterSourcePull: jest.fn().mockResolvedValue(undefined),
      upsertSourceConsents: jest.fn().mockResolvedValue(undefined),
      markSourcesRefreshed: jest.fn().mockResolvedValue(undefined),
    };
    const sourceRepository = {
      find: jest.fn().mockResolvedValue([{ id: 11, sourceName: '3221',isDirect:true }, { id: 12, sourceName: '9999',isDirect:false }]),
      query: jest.fn().mockResolvedValue(undefined),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const processingService = { process: jest.fn().mockResolvedValue({ newlySavedToCache: 0, alreadyExistingInCache: 0 }) };
    const authService = { getTppId: () => 'tpp-id', getTppApiUrl: () => 'http://feezback.test' };

    const service = new FeezbackService(
      {} as any,               // FeezbackJwtService
      authService as any,      // FeezbackAuthService
      feezbackApiService as any,
      consentApi as any,
      processingService as any,
      userSyncStateService as any,
      userRepository as any,
      sourceRepository as any,
      {} as any,               // BillingService
      { sendMail: jest.fn() } as any, // MailService
    );

    // Debug-file writer is a best-effort dev aid — stub it so tests don't
    // touch the filesystem.
    (service as any).saveSourceTransactionsToFile = jest
      .fn()
      .mockReturnValue({ paymentIdentifier: 'x', full: null, simple: null });

    return { service, feezbackApiService, consentApi, userSyncStateService, sourceRepository, userRepository, processingService };
  }

  it('does not introduce direct classification or fetch an unverified card with missing balances',async()=>{
    const {service,sourceRepository,feezbackApiService,consentApi}=makeService();
    sourceRepository.find.mockResolvedValue([]);
    feezbackApiService.getUserCards.mockResolvedValue({cards:[directCard]});
    const result=await (service as any).getAndSaveUserCardTransactionsInternal(USER,SUB,'booked');
    expect(consentApi.getCardTransactions).not.toHaveBeenCalled();
    expect(result.directCards).toHaveLength(0);
    expect(result.cardErrors[0].code).toBe('CARD_DATA_NOT_READY');
  });
  // ─── determineIsDirect ─────────────────────────────────────────────────────

  describe('determineIsDirect', () => {
    it('returns true when balances is an empty array (Direct card)', () => {
      const { service } = makeService();
      expect((service as any).determineIsDirect({ balances: [] })).toBe(true);
    });

    it('returns true when balances is missing entirely', () => {
      const { service } = makeService();
      expect((service as any).determineIsDirect({})).toBe(true);
    });

    it('returns false when balances are present (credit card)', () => {
      const { service } = makeService();
      expect((service as any).determineIsDirect(creditCard)).toBe(false);
    });
  });

  // ─── Card sync: Direct card (empty balances) ───────────────────────────────

  describe('card sync with a Direct card (empty balances)', () => {
    it('imports a known Direct card with merchant details and signed amount', async () => {
      const { service, feezbackApiService, consentApi } = makeService();
      feezbackApiService.getUserCards.mockResolvedValue({ cards: [directCard] });
      consentApi.getCardTransactions.mockResolvedValue({ transactions: { booked: [{ cardTransactionId: 'direct-tx', transactionDate: '2026-07-01', transactionAmount: { amount: '49.44', currency: 'ILS' }, cardAcceptorName: 'שופרסל' }] } });
      const result = await (service as any).getAndSaveUserCardTransactionsInternal(USER, SUB, 'booked');
      expect(consentApi.getCardTransactions).toHaveBeenCalledTimes(1);
      expect(result.directCards).toHaveLength(0);
      expect(result.normalizedTransactions).toEqual([expect.objectContaining({ externalTransactionId: 'direct-tx', merchantName: 'שופרסל', amount: -49.44 })]);
    });

    it('persists isDirect=false and fetches Card Transactions normally', async () => {
      const { service, feezbackApiService, consentApi, sourceRepository } = makeService();
      feezbackApiService.getUserCards.mockResolvedValue({ cards: [creditCard] });
      consentApi.getCardTransactions.mockResolvedValue({ transactions: { booked: [] } });

      const res = await (service as any).getAndSaveUserCardTransactionsInternal(USER, SUB);

      expect(sourceRepository.query).toHaveBeenCalledWith(
        expect.any(String),
        [USER, '9999', SourceType.CREDIT_CARD, false, 'primary', expect.any(Date)],
      );
      expect(consentApi.getCardTransactions).toHaveBeenCalledWith(
        SUB, 'consent-1', 'card-credit', 'booked', undefined, undefined,
      );
      expect(res.cardsSkippedDirect).toBe(0);
      expect(res.directCards).toHaveLength(0);
      expect(res.cards).toHaveLength(1);
    });

    it('splits a mixed direct+credit card list correctly', async () => {
      const { service, feezbackApiService, consentApi } = makeService();
      feezbackApiService.getUserCards.mockResolvedValue({ cards: [directCard, creditCard] });
      consentApi.getCardTransactions.mockResolvedValue({ transactions: { booked: [] } });

      const res = await (service as any).getAndSaveUserCardTransactionsInternal(USER, SUB);

      // Both feeds are imported; bank exclusion is a separate user preference.
      expect(consentApi.getCardTransactions).toHaveBeenCalledTimes(2);
      expect(consentApi.getCardTransactions).toHaveBeenCalledWith(
        SUB, 'consent-1', 'card-credit', 'booked', undefined, undefined,
      );
      expect(res.directCards).toEqual([]);
      expect(res.cards.map((c: any) => c.cardResourceId)).toEqual(['card-direct', 'card-credit']);
    });
  });

  // ─── Cards/balances fetch failure ──────────────────────────────────────────

  describe('cards+balances fetch failure', () => {
    it('aborts the card sync: no Card Transactions call, no isDirect written', async () => {
      const { service, feezbackApiService, consentApi, sourceRepository } = makeService();
      feezbackApiService.getUserCards.mockRejectedValue(new Error('feezback down'));

      await expect(
        (service as any).getAndSaveUserCardTransactionsInternal(USER, SUB),
      ).rejects.toThrow('feezback down');

      expect(consentApi.getCardTransactions).not.toHaveBeenCalled();
      expect(sourceRepository.query).not.toHaveBeenCalled();
    });
  });

  // ─── upsertSources: bank vs card isolation ─────────────────────────────────

  describe('upsertSources isDirect isolation', () => {
    it('bank upserts always pass NULL for isDirect (COALESCE keeps any stored card value)', async () => {
      const { service, sourceRepository } = makeService();

      await (service as any).upsertSources(USER, SourceType.BANK_ACCOUNT, [
        { sourceName: '1234567', resourceId: null },
      ]);

      const [sql, params] = sourceRepository.query.mock.calls[0];
      expect(params).toEqual([USER, '1234567', SourceType.BANK_ACCOUNT, null, 'primary', expect.any(Date)]);
      // The SQL-side guarantee: a NULL incoming value never overwrites a stored one.
      expect(sql).toContain('COALESCE(VALUES(`isDirect`), `isDirect`)');
    });

    it('bank upserts force NULL even if a caller mistakenly passes isDirect', async () => {
      const { service, sourceRepository } = makeService();

      await (service as any).upsertSources(USER, SourceType.BANK_ACCOUNT, [
        { sourceName: '1234567', resourceId: null, isDirect: true },
      ]);

      const [, params] = sourceRepository.query.mock.calls[0];
      expect(params[3]).toBeNull();
    });

    it('card upserts without a determination pass NULL (existing value preserved)', async () => {
      const { service, sourceRepository } = makeService();

      await (service as any).upsertSources(USER, SourceType.CREDIT_CARD, [
        { sourceName: '3221', resourceId: 'card-direct' },
      ]);

      const [, params] = sourceRepository.query.mock.calls[0];
      expect(params[3]).toBeNull();
    });

    it('card upserts with a determination pass the boolean through', async () => {
      const { service, sourceRepository } = makeService();

      await (service as any).upsertSources(USER, SourceType.CREDIT_CARD, [
        { sourceName: '3221', resourceId: 'card-direct', isDirect: true },
        { sourceName: '9999', resourceId: 'card-credit', isDirect: false },
      ]);

      expect(sourceRepository.query.mock.calls[0][1][3]).toBe(true);
      expect(sourceRepository.query.mock.calls[1][1][3]).toBe(false);
    });
  });

  // ─── retrySource protection ────────────────────────────────────────────────

  describe('retrySource of a Direct card', () => {
    it('retries a linked Direct card and reports ordinary success', async () => {
      const { service, feezbackApiService, consentApi, userSyncStateService } = makeService();
      userSyncStateService.getSourceResults.mockResolvedValue([{sourceRecordId:11,connectionRole:'primary',sourceId:'3221',type:'card',resourceId:'card-direct',consentId:'consent-1'}]);
      feezbackApiService.getUserCards.mockResolvedValue({ cards: [directCard] });
      consentApi.getCardTransactions.mockResolvedValue({transactions:{booked:[]}});
      const result = await service.retrySource(USER, 'card', '3221');
      expect(result.status).toBe('success');
      expect(consentApi.getCardTransactions).toHaveBeenCalledTimes(1);
      expect(result.consentId).toBe('consent-1');
    });

    it('fails without declaring Direct when stored kind is unknown and no readiness was received', async () => {
      const { service, feezbackApiService, consentApi, userSyncStateService, sourceRepository, processingService } = makeService();
      sourceRepository.findOne.mockResolvedValue({ sourceName: '3221', isDirect: null });
      sourceRepository.find.mockResolvedValue([{id:11,sourceName:'3221',isDirect:null}]);
      userSyncStateService.getSourceResults.mockResolvedValue([
        { sourceRecordId: 11, connectionRole: 'primary', sourceId: '3221', type: 'card', resourceId: 'card-direct', consentId: 'consent-1' },
      ]);
      feezbackApiService.getUserCards.mockResolvedValue({ cards: [directCard] });

      const result = await service.retrySource(USER, 'card', '3221');

      expect(result.status).toBe('failed');
      expect(consentApi.getCardTransactions).not.toHaveBeenCalled();
      expect(processingService.process).not.toHaveBeenCalled();
      expect(userSyncStateService.markCacheReadyAfterSourcePull).not.toHaveBeenCalled();
      expect(userSyncStateService.updateSourceResults).toHaveBeenCalledWith(USER, [
        expect.objectContaining({ status: 'failed', resourceId: 'card-direct' }),
      ]);
    });

    it('preserves consentId and resourceId when a credit-card retry fails', async () => {
      const { service, feezbackApiService, consentApi, userSyncStateService, sourceRepository } = makeService();
      sourceRepository.findOne.mockResolvedValue({ sourceName: '9999', isDirect: false });
      userSyncStateService.getSourceResults.mockResolvedValue([
        { sourceRecordId: 12, connectionRole: 'primary', sourceId: '9999', type: 'card', resourceId: 'card-credit', consentId: 'consent-1' },
      ]);
      feezbackApiService.getUserCards.mockResolvedValue({ cards: [creditCard] });
      consentApi.getCardTransactions.mockRejectedValue(Object.assign(new Error('Forbidden'), { status: 403 }));

      const result = await service.retrySource(USER, 'card', '9999');

      expect(result).toEqual(expect.objectContaining({
        type: 'card',
        sourceId: '9999',
        resourceId: 'card-credit',
        consentId: 'consent-1',
        status: 'failed',
      }));
      expect(userSyncStateService.updateSourceResults).toHaveBeenCalledWith(USER, [
        expect.objectContaining({ consentId: 'consent-1', resourceId: 'card-credit', status: 'failed' }),
      ]);
    });
  });

  // ─── Retry selection ───────────────────────────────────────────────────────

  describe('isRetryablePendingStatus', () => {
    it('selects failed and not_synced for retry', () => {
      expect(FeezbackService.isRetryablePendingStatus('failed')).toBe(true);
      expect(FeezbackService.isRetryablePendingStatus('not_synced')).toBe(true);
    });

    it('retries legacy skipped Direct cards but not success', () => {
      expect(FeezbackService.isRetryablePendingStatus('skipped_direct')).toBe(true);
      expect(FeezbackService.isRetryablePendingStatus('success')).toBe(false);
    });
  });
});
