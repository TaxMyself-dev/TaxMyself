import { BadGatewayException, forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeezbackJwtService } from './feezback-jwt.service';
import { FeezbackAuthService } from './core/feezback-auth.service';
import { FeezbackApiService } from './api/feezback-api.service';
import { FeezbackConsentApiService } from './consent/feezback-consent-api.service';
import { TransactionProcessingService } from '../transactions/transaction-processing.service';
import { UserSyncStateService } from '../transactions/user-sync-state.service';
import { UserSyncState, SourceResult } from '../transactions/user-sync-state.entity';
import { NormalizedTransaction } from '../transactions/interfaces/normalized-transaction.interface';
import { User } from '../users/user.entity';
import { Source } from '../transactions/source.entity';
import { ModuleName, SourceType } from '../enum';
import { BillingService } from '../billing/services/billing.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class FeezbackService {
  private readonly logger = new Logger(FeezbackService.name);
  private readonly tppId: string;

  /** Currency-symbol map for human-readable sourceName suffixes. Unknown codes fall back to `-CODE`. */
  private static readonly CURRENCY_SYMBOLS: Record<string, string> = {
    USD: '$', EUR: '€', GBP: '£', JPY: '¥',
  };

  /**
   * Derive the canonical sourceName / paymentIdentifier from a raw IBAN-last-7
   * or PAN-last-4 plus the source's currency. ILS keeps the raw id unchanged;
   * non-ILS gets a currency-symbol suffix (or `-CODE` fallback). This is the
   * single source of truth — every site that names a Source must route through here.
   */
  private deriveSourceName(rawId: string, currency: string | null | undefined): string {
    if (!rawId) return rawId;
    const c = (currency ?? 'ILS').toUpperCase();
    if (c === 'ILS') return rawId;
    const symbol = FeezbackService.CURRENCY_SYMBOLS[c];
    return symbol ? `${rawId}${symbol}` : `${rawId}-${c}`;
  }

  constructor(
    private readonly feezbackJwtService: FeezbackJwtService,
    private readonly authService: FeezbackAuthService,
    private readonly feezbackApiService: FeezbackApiService,
    private readonly feezbackConsentApiService: FeezbackConsentApiService,
    private readonly processingService: TransactionProcessingService,
    private readonly userSyncStateService: UserSyncStateService,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Source) private readonly sourceRepository: Repository<Source>,
    @Inject(forwardRef(() => BillingService))
    private readonly billingService: BillingService,
  ) {
    this.tppId = this.authService.getTppId();
  }

  /**
   * Admin diagnostic: fetch live accounts + cards from Feezback for a target user.
   * No DB writes. Uses the same options as the internal sync paths so the response
   * matches what the sync would actually see (only valid consents).
   */
  async adminGetAccountsAndCards(
    firebaseId: string,
  ): Promise<{ accounts: any; cards: any }> {
    const sub = `${firebaseId}_sub`;
    const [accountsResponse, cardsResponse] = await Promise.all([
      this.feezbackApiService.getUserAccounts(sub, { preventUpdate: true, withInvalid: false }),
      this.feezbackApiService.getUserCards(sub, { withBalances: false, withInvalid: false, preventUpdate: true }),
    ]);
    return { accounts: accountsResponse, cards: cardsResponse };
  }

  /**
   * Upsert Source rows using the (userId, sourceName) unique index.
   * Race-safe and idempotent. Falsy sourceName entries are skipped.
   * The `bill` FK column is omitted so an existing linkage isn't clobbered.
   * `resourceId` is preserved on update via COALESCE — never overwritten with NULL.
   */
  private async upsertSources(
    userId: string,
    sourceType: SourceType,
    items: Array<{ sourceName: string; resourceId: string | null }>,
  ): Promise<void> {
    // resourceId is intentionally not persisted here — the Feezback resourceId
    // lives in user_source_sync_state (used by pullOneSource/retrySource). The
    // `source` table only maps an account/card to a Bill for bookkeeping.
    for (const { sourceName } of items) {
      if (!sourceName) continue;
      await this.sourceRepository.query(
        `INSERT INTO source (\`userId\`, \`sourceName\`, \`sourceType\`)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE \`sourceType\` = VALUES(\`sourceType\`)`,
        [userId, sourceName, sourceType],
      );
    }
  }

  /**
   * Refresh `Source` rows from the live Feezback API (accounts + cards),
   * ensure the user has OPEN_BANKING module access, and pre-populate
   * `user_source_sync_state` with status='not_synced' for every discovered source.
   *
   * Idempotent — safe to call from the webhook handler AND from the
   * /transactions/post-consent-sync endpoint. Does NOT trigger transaction sync.
   */
  async refreshUserSources(firebaseId: string, eventLabel: string): Promise<void> {
    const masked = firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?');
    const prefix = `[FeezbackSourceSync][${eventLabel}]`;
    const sub = `${firebaseId}_sub`;

    // No pre-mark: triggerFullSync (when called by post-consent / login) will
    // atomically acquire the DB lock and set status='running' itself. Calling
    // markSyncRunning here would acquire that very lock and starve the
    // subsequent triggerFullSync of it. The frontend doesn't poll during this
    // refresh anyway — the post-consent endpoint awaits it before returning 200.

    let user: User | null = null;
    try {
      user = await this.userRepository.findOne({ where: { firebaseId } });
      if (!user) this.logger.warn(`${prefix} Internal user NOT found firebaseId=${masked}`);
    } catch (error: any) {
      this.logger.error(`${prefix} Failed to resolve user firebaseId=${masked}: ${error?.message}`, error?.stack);
    }
    const userName = user ? [user.fName, user.lName].filter(Boolean).join(' ') : masked;

    // NOTE: this method is only called from the consent-completion webhook
    // (UserDataIsAvailable) and the admin-trigger endpoint. OPEN_BANKING
    // *permission* is governed entirely by the subscription plan (see
    // BillingService.hasModuleAccess) — this method does not grant access.
    // It only flips User.hasOpenBanking, which records that the user
    // completed OB onboarding (connected a bank account), independent of
    // whether their plan currently includes the module. If a caller does
    // reach here without a real Feezback consent, the API calls below 404
    // and the BadGatewayException prevents the user from being updated.

    let bankError: string | null = null;
    let cardError: string | null = null;
    let moduleAccessUpdated = false;

    let accounts: any[] = [];
    try {
      const accountsResponse = await this.feezbackApiService.getUserAccounts(sub, { preventUpdate: true });
      accounts = accountsResponse?.accounts ?? [];
      const bankItems = accounts
        .map((acc: any) => {
          const rawId = acc?.iban?.trim().slice(-7);
          if (!rawId) return null;
          return {
            sourceName: this.deriveSourceName(rawId, acc?.currency),
            resourceId: acc?.resourceId ?? null,
          };
        })
        .filter((x): x is { sourceName: string; resourceId: string | null } => x !== null);
      await this.upsertSources(firebaseId, SourceType.BANK_ACCOUNT, bankItems);
    } catch (error: any) {
      bankError = error?.message ?? 'unknown';
      this.logger.error(`${prefix}[Account] Sync failed firebaseId=${masked}: ${bankError}`, error?.stack);
    }

    let cards: any[] = [];
    try {
      const cardsResponse = await this.feezbackApiService.getUserCards(sub, { withBalances: false });
      cards = cardsResponse?.cards ?? [];
      const cardItems = cards
        .map((card: any) => {
          const rawId = card?.maskedPan?.match(/(\d{4})$/)?.[1];
          if (!rawId) return null;
          return {
            sourceName: this.deriveSourceName(rawId, card?.currency),
            resourceId: card?.resourceId ?? null,
          };
        })
        .filter((x): x is { sourceName: string; resourceId: string | null } => x !== null);
      await this.upsertSources(firebaseId, SourceType.CREDIT_CARD, cardItems);
    } catch (error: any) {
      cardError = error?.message ?? 'unknown';
      this.logger.error(`${prefix}[Card] Sync failed firebaseId=${masked}: ${cardError}`, error?.stack);
    }

    // If BOTH bank and card fetches failed, Feezback is fully unavailable for
    // this user — abort early so the post-consent endpoint can return a 502
    // and the dialog can show a clear "service unavailable" message instead of
    // running a transaction sync against an empty/stale source list.
    if (bankError && cardError) {
      throw new BadGatewayException({
        code: 'feezback_unavailable',
        message: 'Feezback API unavailable',
        bankError,
        cardError,
      });
    }

    try {
      if (user && !user.hasOpenBanking) {
        user.hasOpenBanking = true;
        await this.userRepository.save(user);
        moduleAccessUpdated = true;
      }
    } catch (error: any) {
      this.logger.error(`${prefix} Failed to update hasOpenBanking firebaseId=${masked}: ${error?.message}`, error?.stack);
    }

    console.log(`\n════════════════════════════════════`);
    if (eventLabel === 'UserDataIsAvailable') {
      console.log(`  DATA AVAILABLE WEBHOOK ARRIVED`);
      console.log(`  Arrived at: ${new Date().toISOString()}`);
    }
    console.log(`  SOURCE DISCOVERY  (${eventLabel})`);
    console.log(`  User: ${userName}`);
    console.log(`  (valid accounts below)`);
    console.log(`════════════════════════════════════`);
    if (bankError) {
      console.log(`  ✗ Bank — ERROR: ${bankError}`);
    } else {
      const seenBank = new Set<string>();
      const uniqueAccounts = accounts.filter((acc: any) => {
        const rawId = acc?.iban?.trim().slice(-7);
        const sn = rawId ? this.deriveSourceName(rawId, acc?.currency) : null;
        if (!sn || seenBank.has(sn)) return false;
        seenBank.add(sn);
        return true;
      });
      console.log(`  Bank (${uniqueAccounts.length}):`);
      for (const acc of uniqueAccounts) {
        const rawId = acc?.iban?.trim().slice(-7);
        const sn = this.deriveSourceName(rawId, acc?.currency);
        const cid = acc?.consentId ?? acc?.relatedConsents?.[0]?.resourceId ?? '—';
        console.log(`    •  ${sn}   consentId=${cid}`);
      }
    }
    if (cardError) {
      console.log(`  ✗ Cards — ERROR: ${cardError}`);
    } else {
      const seenCard = new Set<string>();
      const uniqueCards = cards.filter((card: any) => {
        const rawId = card?.maskedPan?.match(/(\d{4})$/)?.[1];
        const sn = rawId ? this.deriveSourceName(rawId, card?.currency) : null;
        if (!sn || seenCard.has(sn)) return false;
        seenCard.add(sn);
        return true;
      });
      console.log(`  Cards (${uniqueCards.length}):`);
      for (const card of uniqueCards) {
        const rawId = card?.maskedPan?.match(/(\d{4})$/)?.[1];
        const sn = this.deriveSourceName(rawId, card?.currency);
        const cid = card?.consentId ?? card?.relatedConsents?.[0]?.resourceId ?? '—';
        console.log(`    •  ${sn}   consentId=${cid}`);
      }
    }
    if (moduleAccessUpdated) console.log(`  ✓ Module access enabled`);
    console.log(`════════════════════════════════════\n`);

    // Awaited (not fire-and-forget): callers that await refreshUserSources —
    // notably the admin pull-source self-heal — read user_source_sync_state
    // immediately after. If this stayed `void`, refreshUserSources would
    // resolve before resourceId/consentId are written, and the follow-up
    // retrySource would wrongly see "resourceId not found in DB" (a race).
    // .catch keeps a write failure non-fatal, same as before.
    await this.prePopulateSourceResults(firebaseId, accounts, cards)
      .catch(err => this.logger.warn(`${prefix} prePopulateSourceResults failed | ${err?.message}`));

    // Stamp the freshness marker — at least one of bank/card succeeded, so the
    // login path can trust the Source rows for the next 24h.
    if (!bankError || !cardError) {
      await this.userSyncStateService.markSourcesRefreshed(firebaseId)
        .catch(err => this.logger.warn(`${prefix} markSourcesRefreshed failed | ${err?.message}`));
    }
  }


  /**
   * Write per-source debug files for inspection. For each bank account or card,
   * emits two files in src/feezback/transactions-data:
   *   - <type>-full-<paymentIdentifier>-<timestamp>.json   (raw Feezback transactions)
   *   - <type>-simple-<paymentIdentifier>-<timestamp>.json (normalized rows we persist)
   *
   * Best-effort — errors are swallowed since this is a dev/debug aid.
   */
  private saveSourceTransactionsToFile(
    type: 'bank' | 'card',
    paymentIdentifier: string,
    firebaseId: string,
    rawTransactions: any[],
    normalizedTransactions: NormalizedTransaction[],
    timestamp: string,
  ): { paymentIdentifier: string; full: string | null; simple: string | null } {
    const result = { paymentIdentifier, full: null as string | null, simple: null as string | null };
    if (!paymentIdentifier) return result;

    try {
      const baseDir = process.cwd();
      const outputDir = path.join(baseDir, 'src', 'feezback', 'transactions-data');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const metadata = {
        type,
        paymentIdentifier,
        firebaseId,
        dateGenerated: new Date().toISOString(),
        rawTransactionCount: rawTransactions.length,
        normalizedTransactionCount: normalizedTransactions.length,
      };

      const fullFilePath = path.join(outputDir, `${type}-full-${paymentIdentifier}-${timestamp}.json`);
      fs.writeFileSync(fullFilePath, JSON.stringify({ metadata, transactions: rawTransactions }, null, 2), 'utf8');
      if (fs.existsSync(fullFilePath)) result.full = fullFilePath;

      const simpleFilePath = path.join(outputDir, `${type}-simple-${paymentIdentifier}-${timestamp}.json`);
      fs.writeFileSync(simpleFilePath, JSON.stringify({ metadata, transactions: normalizedTransactions }, null, 2), 'utf8');
      if (fs.existsSync(simpleFilePath)) result.simple = simpleFilePath;
    } catch {
      /* best-effort debug aid; ignore failures */
    }

    return result;
  }

  getTppId(): string {
    return this.tppId;
  }

  getTppApiUrl(): string {
    return this.authService.getTppApiUrl();
  }

  async createConsentLink(firebaseId: string) {
    return this.feezbackApiService.createConsentLink(firebaseId);
  }

  async getUserConsents(sub: string): Promise<{ consents: any[] }> {
    return this.feezbackApiService.getUserConsents(sub);
  }

  async getUserCards(sub: string, consentId: string): Promise<{ cards: any[] }> {
    return this.feezbackConsentApiService.getUserCards(sub, consentId);
  }

  async getCardBalances(sub: string, consentId: string, cardResourceId: string): Promise<any> {
    return this.feezbackConsentApiService.getCardBalances(sub, consentId, cardResourceId);
  }

  async getCardTransactions(
    sub: string,
    consentId: string,
    cardResourceId: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<any> {
    return this.feezbackConsentApiService.getCardTransactions(
      sub,
      consentId,
      cardResourceId,
      bookingStatus,
      dateFrom,
      dateTo,
    );
  }

  async getAccessToken(sub: string): Promise<string> {
    try {
      const token = await this.authService.getAccessToken(sub);
      return token;
    } catch (error: any) {
      // this.logger.error(
      //   `Error getting access token: ${error?.message}`,
      //   error?.stack,
      // );

      if (error?.response?.data) {
        // this.logger.error(
        //   `Feezback error response: ${JSON.stringify(error.response.data)}`,
        // );
      }

      throw error;
    }
  }

  async getUserAccounts(sub: string): Promise<any> {
    return this.feezbackApiService.getUserAccounts(sub, { preventUpdate: true, withInvalid: false, withBalances: true });
  }

  /**
   * Gets transactions for a specific account
   * @param sub - User identifier (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_sub")
   * @param transactionsLink - Full URL to the transactions endpoint
   * @param bookingStatus - Booking status filter (default: "booked")
   * @param dateFrom - Start date for transactions (format: YYYY-MM-DD)
   * @param dateTo - End date for transactions (format: YYYY-MM-DD)
   * @returns Transactions data
   */
  async getAccountTransactions(
    sub: string,
    transactionsLink: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<any> {
    return this.feezbackApiService.getAccountTransactions(sub, transactionsLink, bookingStatus, dateFrom, dateTo);
  }

  /**
   * Extracts firebaseId from context string
   * @param context - Context string (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_context")
   * @returns Firebase ID
   */
  extractFirebaseIdFromContext(context: string): string {
    if (context.endsWith('_context')) {
      return context.replace('_context', '');
    }
    return context;
  }

  /**
   * Extracts sub from user identifier
   * @param user - User identifier (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_sub@KNCAXnwXk1")
   * @returns Sub identifier
   */
  extractSubFromUser(user: string): string {
    // Remove @TPP_ID part
    const parts = user.split('@');
    return parts[0];
  }

  private normalizeMaskedPan(maskedPan?: string | null): string {
    return (maskedPan ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  }

  private dedupeCardsPreferActive(cards: any[]): any[] {
    const map = new Map<string, any>();
  
    for (const card of cards) {
      const key = this.normalizeMaskedPan(card?.maskedPan);
      if (!key) continue;
  
      const existing = map.get(key);
  
      // אם אין עדיין כרטיס — שמור
      if (!existing) {
        map.set(key, card);
        continue;
      }
  
      const existingExpired = existing?.consentStatus === 'expired';
      const currentExpired = card?.consentStatus === 'expired';
  
      // אם הקיים expired והחדש לא — תחליף
      if (existingExpired && !currentExpired) {
        map.set(key, card);
      }
  
      // אחרת לא עושים כלום (שומרים את הקיים)
    }
  
    return Array.from(map.values());
  }

  private readonly runningCardSyncByUser = new Map<string, Promise<any>>();

  private async getAndSaveUserCardTransactionsInternal(
    userId: string,
    sub: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
    cardResourceId?: string,
  ): Promise<any> {
    const tCard = Date.now();

    const cardsResponse = await this.feezbackApiService.getUserCards(sub, {
      withBalances: true,
      withInvalid: false,
      preventUpdate: true,
    });
    const cards = this.dedupeCardsPreferActive(cardsResponse?.cards);
    // const cards = cardsResponse?.cards || [];
    const cardUpsertItems = (cards ?? [])
      .map((card: any) => {
        const rawId = card?.maskedPan?.match(/(\d{4})$/)?.[1];
        if (!rawId) return null;
        return {
          sourceName: this.deriveSourceName(rawId, card?.currency),
          resourceId: card?.resourceId ?? null,
        };
      })
      .filter((x): x is { sourceName: string; resourceId: string | null } => x !== null);
    await this.upsertSources(userId, SourceType.CREDIT_CARD, cardUpsertItems);
    const filteredCards = cardResourceId
      ? cards.filter(card => card?.resourceId === cardResourceId)
      : cards;

    const cardInfoMap: Record<string, any> = {};
    const cardsResult: any[] = [];

    // ✅ נשמור טרנזקציות עם מטא — משמש גם ל-DB וגם לפיצול לקובץ דיבוג לפי כרטיס
    const allTransactionsForDb: any[] = [];

    // ✅ חלוקה לפי כרטיס לקובץ — keyed by card.resourceId (cardId), not name.
    // displayName/maskedPan are still preserved inside __cardMeta for human-friendly logs.
    const transactionsByCard: Record<string, any[]> = {};

    const cardErrors: Array<{
      cardResourceId: string;
      consentId: string | null;
      displayName: string;
      maskedPan: string | null;
      currency: string | null;
      status?: number;
      code?: string;
      message: string;
      responseData?: any;
    }> = [];

    // Fetch all card transactions in parallel
    const cardFetchResults = await Promise.all(
      filteredCards.map(async (card: any) => {
        const cardId = card?.resourceId;
        if (!cardId) {
          this.logger.warn('Skipping card without resourceId');
          return null;
        }

        const consentId =
          card?.consentId ||
          card?.relatedConsents?.[0]?.resourceId ||
          null;

        const cardName =
          card?.displayName ||
          card?.name ||
          card?.maskedPan ||
          cardId;

        try {
          if (!consentId) {
            throw Object.assign(new Error('Missing consentId for card'), { status: 400 });
          }

          const transactionsResponse =
            await this.feezbackConsentApiService.getCardTransactions(
              sub,
              consentId,
              cardId,
              bookingStatus,
              dateFrom,
              dateTo,
            );

          const transactions = this.extractCardTransactions(transactionsResponse);
          const cardMeta = {
            cardResourceId: cardId,
            displayName: cardName,
            maskedPan: card?.maskedPan ?? null,
            currency: card?.currency ?? null,
            consentId,
          };
          const transactionsWithMeta = transactions.map((tx: any) => ({ ...tx, __cardMeta: cardMeta }));

          return { card, cardId, cardName, consentId, transactions, transactionsWithMeta, rawResponse: transactionsResponse, failed: false };
        } catch (err: any) {
          const status = err?.status ?? err?.response?.status;
          const code = err?.code;
          const message = err?.message || 'Unknown error';
          this.logger.warn(
            `[CardFetch] Failed | card=${cardName} | consent=${consentId} | status=${status} | error=${message}`,
          );
          return {
            card, cardId, cardName, consentId: consentId ?? null,
            transactions: [] as any[], transactionsWithMeta: [] as any[],
            failed: true, err: { status, code, message, responseData: err?.response?.data
              ? (typeof err.response.data === 'string' ? err.response.data.slice(0, 500) : err.response.data)
              : undefined },
          };
        }
      }),
    );

    for (const result of cardFetchResults) {
      if (!result) continue; // skipped (no resourceId)

      const { card, cardId, cardName, consentId, transactions, transactionsWithMeta, rawResponse, failed } = result as any;
      cardInfoMap[cardId] = card;

      if (failed) {
        const { status, code, message, responseData } = (result as any).err;
        cardErrors.push({ cardResourceId: cardId, consentId, displayName: cardName, maskedPan: card?.maskedPan ?? null, currency: card?.currency ?? null, status, code, message, responseData });
        if (!(cardId in transactionsByCard)) {
          transactionsByCard[cardId] = [{ __cardMeta: { cardResourceId: cardId, displayName: cardName, maskedPan: card?.maskedPan ?? null, currency: card?.currency ?? null, consentId }, __error: { status, code, message } }];
        }
      } else {
        transactionsByCard[cardId] = transactionsWithMeta;
        allTransactionsForDb.push(...transactionsWithMeta);
        cardsResult.push({ cardResourceId: cardId, displayName: cardName, maskedPan: card?.maskedPan, consentId, transactions, rawResponse });
      }
    }


    // Build valid-card set from cards successfully fetched (withInvalid=false already filters at API level).
    // Filtering by cardResourceId keeps historical transactions after consent renewal, where old
    // transactions still carry the old consentId even though the card itself has a valid consent.
    const validCardIds = new Set<string>(
      cardFetchResults
        .filter((r): r is NonNullable<typeof r> => !!r && !r.failed)
        .map(r => r.cardId),
    );

    // Normalize only — DB persistence is handled by the caller (doFullSync).
    let normalizedTransactions: NormalizedTransaction[] = [];
    let processingError: string | null = null;
    const databaseSaveResult: { saved: number; skipped: number; message: string } | null = null;
    try {
      normalizedTransactions = this.normalizeCardTransactions(allTransactionsForDb, cardInfoMap, validCardIds);
    } catch (err: any) {
      this.logger.error(`[CardFetch] Normalize failed | userId=${userId?.substring(0, 8)}... | error=${err.message}`, err.stack);
      processingError = err.message;
    }

    // Per-card debug files: one full + one simple per card. paymentIdentifier
    // includes the currency suffix so multi-currency cards (rare) get distinct files.
    // transactionsByCard is keyed by cardId; we read display info from __cardMeta.
    const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const savedFiles: Array<{ paymentIdentifier: string; full: string | null; simple: string | null }> = [];
    for (const cardId of Object.keys(transactionsByCard)) {
      const txs = transactionsByCard[cardId] || [];
      const maskedPan: string | undefined = txs[0]?.__cardMeta?.maskedPan ?? undefined;
      const cardCurrency: string | null = txs[0]?.__cardMeta?.currency ?? null;
      const rawId = typeof maskedPan === 'string' ? maskedPan.match(/(\d{4})$/)?.[1] : undefined;
      if (!rawId) continue;
      const paymentIdentifier = this.deriveSourceName(rawId, cardCurrency);
      const normalizedForSource = normalizedTransactions.filter(n => n.paymentIdentifier === paymentIdentifier);
      savedFiles.push(
        this.saveSourceTransactionsToFile('card', paymentIdentifier, userId, txs, normalizedForSource, fileTimestamp),
      );
    }

    const cardNormalizedCount = normalizedTransactions.length;
    const syncSummary = {
      bank: { banksProcessed: 0, transactionsFetched: 0 },
      card: {
        cardsProcessed: cardsResult.length,
        transactionsFetched: cardNormalizedCount,
      },
      system: {
        totalProcessed: cardNormalizedCount,
        savedInCurrentImport: 0,
        alreadyExisting: 0,
      },
    };

    const result = {
      asOf: new Date().toISOString(),
      bookingStatus,
      dateFrom,
      dateTo,

      // Normalized fields (aligned with bank response shape)
      transactions: allTransactionsForDb,
      totalTransactions: allTransactionsForDb.length,
      accountsProcessed: filteredCards.length,
      databaseSaveResult,

      // Card-specific fields
      cardsProcessed: filteredCards.length,
      cardsSucceeded: cardsResult.length,
      cardsFailed: cardErrors.length,

      savedFiles,
      normalizedTransactions,
      processingError,
      cards: cardsResult,
      cardErrors,

      syncSummary,
    };

    return { ...result, __durationMs: Date.now() - tCard };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Runs `fn` over `items` with at most `limit` concurrent executions,
   * preserving input order in the returned array. Used to cap how many
   * per-account Feezback calls fire at once (unbounded Promise.all over many
   * accounts can trip Feezback rate-limits and cause spurious failures).
   */
  private async mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    fn: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let next = 0;
    const worker = async (): Promise<void> => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await fn(items[i], i);
      }
    };
    const workerCount = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
    return results;
  }

  async getAndSaveUserCardTransactions(
    userId: string,
    sub: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
    cardResourceId?: string,
  ): Promise<any> {
    const key = `${userId}:${sub}:cards`;

    const existing = this.runningCardSyncByUser.get(key);
    if (existing) {
      this.logger.warn(`[CardFetch] Already running for key=${key}, skipping duplicate`);
      return existing;
    }


    const promise = (async () => {
      try {
        return await this.getAndSaveUserCardTransactionsInternal(
          userId,
          sub,
          bookingStatus,
          dateFrom,
          dateTo,
          cardResourceId,
        );
      } finally {
        this.runningCardSyncByUser.delete(key);
      }
    })();

    this.runningCardSyncByUser.set(key, promise);
    return promise;
  }

  /**
   * Persists a batch of already-normalized transactions for a user.
   * Exposed so that controller endpoints can opt-in to persistence after fetching,
   * without the fetch functions themselves calling process() directly.
   *
   * Returns null when the array is empty (nothing to persist).
   */
  async persistNormalizedTransactions(
    userId: string,
    normalizedTransactions: NormalizedTransaction[],
  ): Promise<any> {
    if (!normalizedTransactions || normalizedTransactions.length === 0) {
      return null;
    }
    console.log(`════════════════════════════════════`);
    console.log(`  DB PERSIST`);
    console.log(`  Count: ${normalizedTransactions.length}`);
    console.log(`════════════════════════════════════`);
    const tDb = Date.now();
    const pr = await this.processingService.process(userId, normalizedTransactions);
    console.log(`  ✓ Persist done — ${((Date.now() - tDb) / 1000).toFixed(2)}s | saved=${pr.newlySavedToCache} | skipped=${pr.alreadyExistingInCache}\n`);
    return pr;
  }

  /**
   * Fetches all bank account transactions, saves to legacy DB + new processing pipeline.
   * Moves orchestration that was previously in the controller into the service.
   */
  async getAndSaveBankTransactions(
    firebaseId: string,
    sub: string,
    bookingStatus: string = 'booked',
    dateFrom?: string,
    dateTo?: string,
  ): Promise<any> {
    const tBank = Date.now();

    // Step 1: Get all accounts
    let accountsResponse;
    try {
      accountsResponse = await this.feezbackApiService.getUserAccounts(sub, { preventUpdate: true, withInvalid: false });
    } catch (error: any) {
      this.logger.error(`[BankFetch] Accounts fetch failed | firebaseId=${firebaseId?.substring(0, 8)}... | status=${error?.status ?? 'unknown'} | error=${error?.message}`, error?.stack);
      if (error?.status === 404 || error?.code === 'ACCOUNTS_NOT_FOUND') {
        return {
          transactions: [],
          accountsProcessed: 0,
          accountsFailed: 1,
          bankErrors: [{ sourceId: 'consent', displayName: 'חשבון בנק', message: 'CONSENT_REQUIRED' }],
          totalTransactions: 0,
          transactionsByAccount: {},
          normalizedTransactions: [],
          error: 'CONSENT_REQUIRED',
          message: 'User accounts not found. Please complete the Feezback consent flow first.',
        };
      }
      throw error;
    }

    const rawAccounts = accountsResponse?.accounts || [];

    // Guard: skip accounts whose consent is not valid (expired, revoked, etc.).
    // withInvalid=false already asks the API to omit them, but we add a defensive
    // client-side check so we never process stale/invalid data regardless of API behaviour.
    const accounts = rawAccounts.filter((acc: any) => {
      if (acc.consentStatus && acc.consentStatus !== 'valid') {
        this.logger.warn(`[BankFetch] Skipping account "${acc.iban?.slice(-7) ?? acc.name}" — consentStatus=${acc.consentStatus}`);
        return false;
      }
      if (acc._meta?.isExpired === true) {
        this.logger.warn(`[BankFetch] Skipping account "${acc.iban?.slice(-7) ?? acc.name}" — consent isExpired=true`);
        return false;
      }
      return true;
    });

    const bankUpsertItems = accounts
      .map((acc: any) => {
        const rawId = acc?.iban?.trim().slice(-7);
        if (!rawId) return null;
        return {
          sourceName: this.deriveSourceName(rawId, acc?.currency),
          resourceId: acc?.resourceId ?? null,
        };
      })
      .filter((x): x is { sourceName: string; resourceId: string | null } => x !== null);
    await this.upsertSources(firebaseId, SourceType.BANK_ACCOUNT, bankUpsertItems);

    if (!accounts || accounts.length === 0) {
      // No bank accounts linked yet (card-only user or pending consent) — not an error.
      return {
        transactions: [],
        accountsProcessed: 0,
        accountsFailed: 0,
        totalTransactions: 0,
        transactionsByAccount: {},
        normalizedTransactions: [],
      };
    }

    // Step 2: Fetch transactions per account — bounded parallelism so a user
    // with many accounts doesn't fire one unbounded burst at Feezback (429s).
    const ACCOUNT_FETCH_CONCURRENCY = 4;
    const accountFetchResults = await this.mapWithConcurrency(
      accounts,
      ACCOUNT_FETCH_CONCURRENCY,
      async (account: any) => {
        try {
          if (!account._links?.transactions?.href) {
            this.logger.warn(`[BankFetch] Account "${account.iban?.slice(-7) ?? account.name}" has no transactions link — skipping (not yet provisioned)`);
            return { account, transactions: [] as any[], failed: false, error: null };
          }
          const transactionsResponse = await this.feezbackApiService.getAccountTransactions(
            sub,
            account._links.transactions.href,
            bookingStatus,
            dateFrom,
            dateTo,
          );
          const rawTransactions = this.extractBankTransactions(transactionsResponse);
          // Stamp the account's IBAN + currency directly onto each transaction so
          // normalization can attribute the tx to the right Source row without relying
          // on the transactionToAccountMap lookup (which collides when two sub-accounts
          // share the same `name`, e.g., ILS + USD on the same IBAN).
          const transactions = rawTransactions.map((tx: any) => ({
            ...tx,
            __accountIban: account.iban ?? null,
            __accountCurrency: account.currency ?? null,
          }));
          return { account, transactions, failed: false, error: null };
        } catch (error: any) {
          this.logger.error(
            `[BankFetch] Account failed | account=${account.iban?.slice(-7) ?? account.name} | status=${error?.status ?? 'unknown'} | error=${error.message}`,
            error.stack,
          );
          return { account, transactions: [] as any[], failed: true, error };
        }
      },
    );

    // All maps below are keyed by account.resourceId — Feezback's unique per-account
    // identifier. Previously they were keyed by account.name, which collides when two
    // sub-accounts (e.g., ILS + USD on the same IBAN) share the same name. resourceId
    // is always unique per fetched account, eliminating that whole class of bugs.
    const allTransactions: any[] = [];
    const accountTransactionsMap: { [accountResourceId: string]: any[] } = {};
    let accountsFailed = 0;
    const bankErrors: Array<{ sourceId: string; displayName: string; iban?: string; currency?: string; status?: number; message: string }> = [];

    for (const { account, transactions, failed, error } of accountFetchResults as any[]) {
      const accId: string | undefined = account?.resourceId ?? account?.iban ?? account?.name;
      if (failed) {
        accountsFailed++;
        bankErrors.push({
          sourceId: accId ?? 'unknown',
          displayName: account.name,
          iban: account.iban,
          currency: account.currency,
          status: error?.status,
          message: error?.message || 'Unknown error',
        });
      } else if (accId) {
        if (accountTransactionsMap[accId]) {
          accountTransactionsMap[accId].push(...transactions);
        } else {
          accountTransactionsMap[accId] = transactions;
        }
        if (transactions.length > 0) {
          allTransactions.push(...transactions);
        }
      }
    }

    // Build account info/mapping for legacy save + normalization (keyed by resourceId).
    const accountInfoMap: { [accountResourceId: string]: any } = {};
    (accountsResponse?.accounts || []).forEach((acc: any) => {
      const id = acc?.resourceId ?? acc?.iban ?? acc?.name;
      if (id) accountInfoMap[id] = acc;
    });

    const transactionToAccountMap: { [transactionId: string]: string } = {};
    Object.keys(accountTransactionsMap).forEach(accResourceId => {
      (accountTransactionsMap[accResourceId] || []).forEach((tx: any) => {
        if (tx.transactionId) {
          transactionToAccountMap[tx.transactionId] = accResourceId;
        }
      });
    });

    const response: any = {
      transactions: allTransactions,
      accountsProcessed: Object.keys(accountTransactionsMap).length,
      accountsFailed,
      bankErrors,
      totalTransactions: allTransactions.length,
      transactionsByAccount: accountTransactionsMap,
      accountInfoMap,
      savedFiles: [],
    };

    if (allTransactions.length === 0) {
      response.normalizedTransactions = [];
      response.databaseSaveResult = { saved: 0, skipped: 0, message: 'No transactions to save' };
      response.syncSummary = {
        bank: { banksProcessed: response.accountsProcessed, transactionsFetched: 0 },
        card: { cardsProcessed: 0, transactionsFetched: 0 },
        system: { totalProcessed: 0, savedInCurrentImport: 0, alreadyExisting: 0 },
      };
      return response;
    }

    // Build valid-IBAN set from accounts that already passed the consent filter above.
    // Filtering by account IBAN (not transaction consentId) ensures historical transactions
    // fetched under a previous consent are kept after renewal, as long as the account itself
    // still has a valid consent.
    const validIbans = new Set<string>(
      accounts.filter((acc: any) => acc.iban).map((acc: any) => acc.iban as string),
    );

    // Normalize only — DB persistence is handled by the caller (doFullSync).
    try {
      const normalized = this.normalizeBankTransactions(
        allTransactions,
        accountInfoMap,
        transactionToAccountMap,
        validIbans,
      );
      response.normalizedTransactions = normalized;
    } catch (error: any) {
      this.logger.error(`[BankFetch] Normalize failed | firebaseId=${firebaseId?.substring(0, 8)}... | error=${error.message}`, error.stack);
      response.processingError = error.message;
      response.normalizedTransactions = [];
    }

    // Per-account debug files: one full + one simple per bank account. We iterate
    // accountFetchResults (not accountTransactionsMap) because the map is keyed by
    // account.name — when two sub-accounts share a name (e.g., ILS + USD on the
    // same IBAN), the map merges them. The fetch-results array preserves each
    // sub-account's own transactions distinctly.
    const fileTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const normalizedRows = response.normalizedTransactions as NormalizedTransaction[];
    for (const { account, transactions, failed } of accountFetchResults as any[]) {
      if (failed) continue;
      const iban: string | undefined = account?.iban;
      const rawId = iban?.trim().slice(-7);
      if (!rawId) continue;
      const paymentIdentifier = this.deriveSourceName(rawId, account?.currency);
      const normalizedForSource = normalizedRows.filter(n => n.paymentIdentifier === paymentIdentifier);
      response.savedFiles.push(
        this.saveSourceTransactionsToFile('bank', paymentIdentifier, firebaseId, transactions, normalizedForSource, fileTimestamp),
      );
    }

    const bankNormalizedCount = normalizedRows.length;
    response.syncSummary = {
      bank: {
        banksProcessed: response.accountsProcessed,
        transactionsFetched: bankNormalizedCount,
      },
      card: { cardsProcessed: 0, transactionsFetched: 0 },
      system: {
        totalProcessed: bankNormalizedCount,
        savedInCurrentImport: 0,
        alreadyExisting: 0,
      },
    };

    return { ...response, __durationMs: Date.now() - tBank };
  }

  // ---------------------------------------------------------------------------
  // Normalization: raw Feezback data → NormalizedTransaction[]
  // ---------------------------------------------------------------------------

  private normalizeBankTransactions(
    transactions: any[],
    accountInfoMap: { [accountResourceId: string]: any },
    transactionToAccountMap: { [transactionId: string]: string },
    validIbans: Set<string>,
    // Single-account pull knows every tx belongs to one account and overrides
    // paymentIdentifier itself, so a missing IBAN is expected — not an anomaly
    // worth alarming on (unlike the multi-account full sync, where it means a
    // tx couldn't be attributed). When true, suppress the missing-IBAN log.
    singleAccountMode = false,
  ): NormalizedTransaction[] {
    // Filter by account IBAN — keeps all transactions for accounts with a valid consent,
    // including historical transactions that carry an older consentId after consent renewal.
    // Transactions with no IBAN stamp are kept (they came from a valid account that had no IBAN).
    let droppedInvalidConsentBank = 0;
    const validTxs = transactions.filter(tx => {
      const iban = tx?.__accountIban;
      if (iban && !validIbans.has(iban)) {
        droppedInvalidConsentBank++;
        return false;
      }
      return true;
    });

    // In-response dedup by transactionId — cheap safety net in case Feezback ever
    // returns the same tx twice in one payload. Keep the entry with the latest referenceTime.
    const deduped = new Map<string, any>();
    for (const tx of validTxs) {
      const key = tx?.transactionId;
      if (!key) continue;
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, tx);
      } else {
        const existingTime = existing.referenceTime ? new Date(existing.referenceTime).getTime() : 0;
        const newTime = tx.referenceTime ? new Date(tx.referenceTime).getTime() : 0;
        if (newTime > existingTime) {
          deduped.set(key, tx);
        }
      }
    }
    const dedupedTransactions = Array.from(deduped.values());

    const result: NormalizedTransaction[] = [];
    let droppedMissingId = 0;
    let droppedInvalidDate = 0;
    let droppedInvalidAmount = 0;

    for (const tx of dedupedTransactions) {
      // Feezback's transactionId is now guaranteed unique + stable per physical tx
      // across sync calls, so we use it directly as the external id.
      const externalId = tx?.transactionId;
      if (!externalId || typeof externalId !== 'string' || externalId.trim() === '') {
        droppedMissingId++;
        continue;
      }

      const transactionDate = this.parseTxDate(tx, 'BANK');
      if (!transactionDate) { droppedInvalidDate++; continue; }

      const amount = this.parseTxAmount(tx, 'BANK');
      if (amount === null) { droppedInvalidAmount++; continue; }

      const accountResourceId = transactionToAccountMap[externalId] || null;
      const accountInfo = accountResourceId ? accountInfoMap[accountResourceId] : null;

      // .slice(-7) matches the format stored in Source.sourceName for bank accounts.
      // TransactionProcessingService.buildBillMap() looks up paymentIdentifier
      // against source.sourceName, so the format must be identical.
      // Currency suffix is appended via deriveSourceName so multi-currency sub-accounts
      // sharing the same IBAN (e.g., ILS + USD) get distinct paymentIdentifiers.
      const fullIdentifier = this.resolveBankPaymentIdentifier(tx, accountInfo, singleAccountMode);
      const accountCurrency = tx?.__accountCurrency ?? accountInfo?.currency ?? null;

      result.push({
        externalTransactionId: externalId,
        merchantName: this.resolveBankMerchantName(tx),
        amount,
        currency: tx?.transactionAmount?.currency ?? 'ILS',
        transactionDate,
        paymentDate: this.parseDateCandidate(tx?.valueDate),
        paymentIdentifier: this.deriveSourceName(fullIdentifier.slice(-7), accountCurrency),
        billId: null,
        billName: null,
        businessNumber: null,
        note: tx?.remittanceInformationUnstructured || tx?.additionalInformation || null,
      });
    }

    return result;
  }

  private normalizeCardTransactions(
    transactions: any[],
    cardInfoMap: Record<string, any>,
    validCardIds: Set<string>,
  ): NormalizedTransaction[] {
    const result: NormalizedTransaction[] = [];
    let droppedMissingId = 0;
    let droppedInvalidDate = 0;
    let droppedInvalidAmount = 0;
    let droppedInvalidConsent = 0;

    const seenCardIds = new Set<string>();

    for (const tx of transactions) {
      const cardResourceId = tx?.__cardMeta?.cardResourceId;
      if (!cardResourceId || !validCardIds.has(cardResourceId)) {
        droppedInvalidConsent++;
        continue;
      }

      // Feezback's cardTransactionId is now guaranteed unique + stable per physical tx
      // across sync calls, so we use it directly as the external id.
      const externalId = tx?.cardTransactionId;
      if (!externalId || typeof externalId !== 'string' || externalId.trim() === '') {
        droppedMissingId++;
        continue;
      }
      if (seenCardIds.has(externalId)) continue;
      seenCardIds.add(externalId);

      const transactionDate = this.parseTxDate(tx, 'CARD');
      if (!transactionDate) { droppedInvalidDate++; continue; }

      const cardAmountInfo = this.resolveCardAmount(tx);
      if (cardAmountInfo.amount === null) { droppedInvalidAmount++; continue; }
      const amount = -cardAmountInfo.amount;
      const currency = cardAmountInfo.currency ?? 'ILS';

      const cardMeta = tx?.__cardMeta || null;
      const cardInfo = cardMeta?.cardResourceId ? cardInfoMap[cardMeta.cardResourceId] : null;
      const { identifier: paymentIdentifier } = this.resolveCardPaymentIdentifier(tx, cardMeta, cardInfo);
      // Apply currency suffix so a card with non-ILS currency gets a distinct sourceName.
      const cardCurrency = cardMeta?.currency ?? cardInfo?.currency ?? null;
      const finalPaymentIdentifier = paymentIdentifier ? this.deriveSourceName(paymentIdentifier, cardCurrency) : paymentIdentifier;

      result.push({
        externalTransactionId: externalId,
        merchantName: this.resolveCardMerchantName(tx),
        amount,
        currency,
        transactionDate,
        paymentDate: null,
        paymentIdentifier: finalPaymentIdentifier,
        billId: null,
        billName: null,
        businessNumber: null,
        note: tx?.transactionDetails || null,
      });
    }

    if (droppedInvalidConsent > 0) {
      this.logger.warn(`[CardNormalize] Skipped ${droppedInvalidConsent} transactions with unrecognised cardResourceId`);
    }

    return result;
  }

  /**
   * Extracts bank transactions from various Feezback response formats.
   */
  private extractBankTransactions(response: any): any[] {
    if (!response) return [];

    if (Array.isArray(response)) return response;

    if (response?.transactions) {
      if (Array.isArray(response.transactions)) return response.transactions;
      if (Array.isArray(response.transactions?.booked)) return response.transactions.booked;
      if (Array.isArray(response.transactions?.pending)) return response.transactions.pending;
    }

    if (Array.isArray(response?.data?.transactions)) return response.data.transactions;
    if (Array.isArray(response?.data)) return response.data;
    if (Array.isArray(response?.booked)) return response.booked;

    // Fallback: find first array property
    for (const key in response) {
      if (Array.isArray(response[key])) return response[key];
    }

    return [];
  }

  private extractCardTransactions(response: any): any[] {
    // console.log("transactionssssssssssss: ", JSON.stringify(response, null, 2));
    if (!response) {
      return [];
    }

    const booked = response?.transactions?.booked
      || response?.data?.transactions?.booked
      || response?.booked
      || response?.data?.booked;

    if (Array.isArray(booked)) {
      return booked;
    }

    if (Array.isArray(response?.transactions)) {
      return response.transactions;
    }

    if (Array.isArray(response?.data?.transactions)) {
      return response.data.transactions;
    }

    if (Array.isArray(response?.data)) {
      return response.data;
    }

    return Array.isArray(response) ? response : [];
  }

  private parseTxDate(tx: any, source: 'BANK' | 'CARD'): Date | null {
    const candidates = source === 'CARD'
      ? [tx?.transactionDate, tx?.acceptorTransactionDateTime, tx?.bookingDate, tx?.valueDate]
      : [tx?.bookingDate, tx?.valueDate];

    for (const candidate of candidates) {
      const parsed = this.parseDateCandidate(candidate);
      if (parsed) {
        return parsed;
      }
    }

    return null;
  }

  private parseDateCandidate(value: any): Date | null {
    if (!value) {
      return null;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private parseTxAmount(tx: any, source: 'BANK' | 'CARD'): number | null {
    const amountInfo = source === 'CARD'
      ? this.resolveCardAmount(tx)
      : { amount: this.parseNumericAmount(tx?.transactionAmount?.amount) };

    if (amountInfo.amount === null) {
      return null;
    }

    if (source === 'CARD') {
      return -amountInfo.amount;
    }

    return amountInfo.amount;
  }

  private resolveCardAmount(tx: any): { amount: number | null; currency: string | null } {
    const txAmount = this.parseNumericAmount(tx?.transactionAmount?.amount);
    const originalAmount = this.parseNumericAmount(tx?.originalAmount?.amount);

    const chosenAmount = (txAmount === null || txAmount === 0) && originalAmount && originalAmount !== 0
      ? originalAmount
      : txAmount;

    const currency = tx?.transactionAmount?.currency
      || tx?.originalAmount?.currency
      || null;

    return {
      amount: chosenAmount,
      currency,
    };
  }

  private parseNumericAmount(value: any): number | null {
    if (value === undefined || value === null) {
      return null;
    }

    const parsed = parseFloat(value.toString().replace(/,/g, ''));
    return Number.isNaN(parsed) ? null : parsed;
  }

  private resolveBankPaymentIdentifier(tx: any, accountInfo: any, singleAccountMode = false): string {
    const accountReference = this.extractBankAccountReference(tx, accountInfo, singleAccountMode);
    if (accountReference) {
      return accountReference;
    }

    if (tx?.entryReference) {
      return tx.entryReference;
    }

    const txId = tx?.transactionId || '';
    return `feezback-${txId.substring(0, 8)}`;
  }

  private extractBankAccountReference(tx: any, accountInfo: any, singleAccountMode = false): string | null {
    // Prefer the IBAN stamped directly onto the transaction at fetch time.
    // Fall back to accountInfo (indirect map lookup) and maskedPan.
    const candidates = [
      tx?.__accountIban,
      accountInfo?.iban,
      accountInfo?.maskedPan,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate;
      }
    }

    // In single-account pull mode a missing IBAN is expected (caller overrides
    // paymentIdentifier with the known sourceId) — don't alarm on it.
    if (!singleAccountMode) {
      console.error(`[extractBankAccountReference] ❌ No IBAN found for transaction | transactionId=${tx?.transactionId} | aspspOriginalId=${tx?.aspspOriginalId}`);
    }
    return null;
  }

  private resolveCardPaymentIdentifier(
    tx: any,
    cardMeta?: any,
    cardInfo?: any,
  ): { identifier: string | null; warning: string | null } {
    type Candidate = { value: any; source: string };

    const candidates: Candidate[] = [
      { value: cardMeta?.maskedPan, source: 'meta.maskedPan' },
      { value: cardInfo?.maskedPan, source: 'cardInfo.maskedPan' },
      { value: tx?.cardAccount?.maskedPan, source: 'tx.cardAccount.maskedPan' },
      { value: tx?.cardDetails?.maskedPan, source: 'tx.cardDetails.maskedPan' },
      { value: tx?.account?.maskedPan, source: 'tx.account.maskedPan' },
      { value: tx?.maskedPan, source: 'tx.maskedPan' },
    ];

    let chosenLast4: string | null = null;
    let chosenSource: string | null = null;

    for (const candidate of candidates) {
      if (!candidate.value) {
        continue;
      }

      const last4 = this.extractCardLast4(candidate.value);
      if (!last4) {
        continue;
      }

      if (!chosenLast4) {
        chosenLast4 = last4;
        chosenSource = candidate.source;
        continue;
      }

      if (chosenLast4 !== last4) {
        return {
          identifier: null,
          warning: `Conflicting card identifiers (${chosenSource}=${chosenLast4} vs ${candidate.source}=${last4})`,
        };
      }
    }

    if (!chosenLast4) {
      console.error(`[resolveCardPaymentIdentifier] ❌ No maskedPan found | transactionId=${tx?.transactionId ?? tx?.cardTransactionId} | cardMeta=${JSON.stringify(cardMeta)}`);
      return {
        identifier: null,
        warning: 'No masked PAN available to derive card identifier',
      };
    }

    return {
      identifier: chosenLast4,
      warning: null,
    };
  }

  private extractCardLast4(value: any): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const match = value.match(/(\d{4})$/);
    return match ? match[1] : null;
  }

  private resolveCardMerchantName(tx: any): string {
    const candidates = [
      tx?.cardAcceptorId,
      tx?.cardAcceptorName,
      tx?.transactionDetails,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate;
      }
    }

    return 'לא זוהה בית עסק';
  }

  private resolveBankMerchantName(tx: any): string {
    const candidates = [
      tx?.creditorName,
      tx?.debtorName,
      tx?.remittanceInformationUnstructured,
      tx?.additionalInformation,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim() !== '') {
        return candidate;
      }
    }

    return 'לא זוהה בית עסק';
  }

  // ---------------------------------------------------------------------------
  // Full-sync orchestration (shared by login and webhook)
  // ---------------------------------------------------------------------------

  private readonly runningFullSyncByUser = new Map<string, Promise<void>>();

  /**
   * Entry point for the two-pull Feezback full-sync flow.
   * Safe to call concurrently from login, webhook, and manual triggers: a per-user
   * in-flight guard returns the existing promise if a sync is already running for that user.
   */

  /**
   * Clears the consentId on Source rows belonging to a revoked/expired consent.
   * Pass-through to UserSyncStateService — exposed here so the webhook handler
   * (which has FeezbackService injected) can call it without pulling in
   * UserSyncStateService directly through a different module path.
   */
  async clearConsentOnSources(firebaseId: string, consentId: string): Promise<number> {
    return this.userSyncStateService.clearConsentOnSources(firebaseId, consentId);
  }

  /**
   * Pass-through to UserSyncStateService.getSyncState. Lets callers (e.g. the
   * users-controller login path) read the persisted sync state without having
   * to import UserSyncStateService directly through a different module path.
   */
  async getUserSyncState(firebaseId: string): Promise<UserSyncState | null> {
    return this.userSyncStateService.getSyncState(firebaseId);
  }

  /**
   * True iff the user clicked "Connect Open Banking" within the last
   * MAX_CONSENT_AGE_MS and the `UserDataIsAvailable` webhook hasn't completed
   * discovery for it yet (i.e. `refreshUserSources` hasn't stamped
   * `lastSourcesRefreshAt` after the consent click).
   *
   * Discovery — NOT a finished sync — is the "consent processed" signal: since
   * the webhook no longer triggers a transaction sync (the user pulls manually),
   * `fullFinishedAt` may never advance. Once discovery runs, Source rows
   * (consentId + resourceId) exist and a pull can succeed, so the consent flow
   * is no longer "pending".
   *
   * SCOPE: this is ONLY a post-consent dialog-readiness signal — it tells the
   * post-consent endpoint / dialog whether to keep showing the "waiting for
   * data-available webhook" loader or enable the manual pull button. It must
   * NOT gate login/manual sync: the webhook does discovery only and never a
   * sync, so there is nothing for a login sync to race.
   *
   * The max-age guard prevents permanent lockout if the user abandoned the
   * Feezback tab or the webhook was lost.
   */
  hasUnprocessedConsentFlow(state: UserSyncState | null): boolean {
    const MAX_CONSENT_AGE_MS = 30 * 60_000;
    const consentAt = state?.lastConsentInitiatedAt;
    if (!consentAt) return false;
    const consentMs = new Date(consentAt).getTime();
    if (Date.now() - consentMs >= MAX_CONSENT_AGE_MS) return false;
    const discoveredAt = state?.lastSourcesRefreshAt;
    if (!discoveredAt) return true;
    return consentMs > new Date(discoveredAt).getTime();
  }

  /**
   * Pass-through to UserSyncStateService.markConsentInitiated. Called by the
   * consent-link controller to stamp the moment the user kicks off a Feezback
   * consent flow.
   */
  async markConsentInitiated(firebaseId: string): Promise<void> {
    return this.userSyncStateService.markConsentInitiated(firebaseId);
  }

  /**
   * Pass-through to UserSyncStateService.clearConsentInitiated. Called by the
   * webhook handler when a consent is revoked/expired to release the user
   * from the "unprocessed consent" login-sync skip.
   */
  async clearConsentInitiated(firebaseId: string): Promise<void> {
    return this.userSyncStateService.clearConsentInitiated(firebaseId);
  }

  /**
   * Registers all discovered bank accounts and cards into user_sync_state.sourceResults
   * immediately after they are fetched from the Feezback API (before the sync runs).
   * New sources get status='not_synced'; existing sources get their consentId updated.
   */
  async prePopulateSourceResults(
    firebaseId: string,
    accounts: any[],
    cards: any[],
  ): Promise<void> {
    const sources: Parameters<UserSyncStateService['upsertSourceConsents']>[1] = [];

    for (const acc of accounts) {
      const iban = acc?.iban?.trim();
      if (!iban) continue;
      const rawId = iban.slice(-7);
      const sourceId = this.deriveSourceName(rawId, acc?.currency);
      const consentId = acc?.consentId ?? acc?.relatedConsents?.[0]?.resourceId ?? undefined;
      // consentId + resourceId are enough to reconstruct the per-account
      // transactions URL on demand (see pullOneSource) — no href is stored.
      sources.push({ type: 'bank', sourceId, resourceId: acc?.resourceId, consentId });
    }

    for (const card of cards) {
      const pan  = card?.maskedPan ?? '';
      const last4 = pan.slice(-4);
      if (!last4) continue;
      const sourceId = this.deriveSourceName(last4, card?.currency);
      const consentId = card?.consentId ?? card?.relatedConsents?.[0]?.resourceId ?? undefined;
      sources.push({ type: 'card', sourceId, resourceId: card?.resourceId, consentId });
    }

    if (sources.length > 0) {
      await this.userSyncStateService.upsertSourceConsents(firebaseId, sources).catch(err =>
        this.logger.warn(`[PrePopulate] upsertSourceConsents failed | firebaseId=${firebaseId?.substring(0, 8)}... | ${err?.message}`),
      );
      this.logger.log(`[PrePopulate] Registered ${sources.length} source(s) | firebaseId=${firebaseId?.substring(0, 8)}...`);
    }
  }

  private getSyncWindow(): { from: string; to: string } {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const yearBack = fmt(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));
    const todayStr = fmt(today);
    return { from: yearBack, to: todayStr };
  }

  async triggerFullSync(firebaseId: string, triggeredBy: 'login' | 'webhook' | 'manual'): Promise<void> {
    const masked = firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?');


    // Dev-only gate — FEEZBACK_MANUAL_SYNC_ONLY=true disables automatic syncs (login/webhook) in non-production.
    // Admin-panel pulls use getAndSaveBankTransactions directly and are not affected.
    if (process.env.NODE_ENV !== 'production' && process.env.FEEZBACK_MANUAL_SYNC_ONLY === 'true' && triggeredBy !== 'manual') {
      console.log(`⏭️  [FullSync] Skipped — FEEZBACK_MANUAL_SYNC_ONLY=true (dev only) | triggeredBy=${triggeredBy} | firebaseId=${masked}\n`);
      return;
    }

    // In-flight guard — reuse existing promise if sync is already running
    const existing = this.runningFullSyncByUser.get(firebaseId);
    if (existing) {
      console.log(`⏭️  [FullSync] Skipped — already running, reusing in-flight promise | triggeredBy=${triggeredBy} | firebaseId=${masked}\n`);
      return existing;
    }


    // Capture sync state BEFORE markSyncRunning overwrites it so doFullSync can
    // correctly determine whether the cache was empty at the time sync was triggered.
    const preSyncState = await this.userSyncStateService.getSyncState(firebaseId).catch(err => {
      this.logger.error(`[FullSync] Failed to read pre-sync state | firebaseId=${masked} | error=${err?.message}`, err?.stack);
      return null;
    });

    // NOTE: there is intentionally NO unprocessed-consent gate here. The
    // webhook only runs discovery (refreshUserSources), never a sync, so a
    // login/manual sync over the user's existing sources can't race it.
    // hasUnprocessedConsentFlow is now used solely for post-consent dialog
    // readiness (see postConsentSync) — do NOT re-add a sync gate on it.

    // Atomically acquire the DB-level "sync running" lock. This is the
    // multi-replica safety net — the in-memory Map above only dedupes within
    // a single Node process. If another process (or pod) already holds the
    // lock, bail out instead of running a duplicate sync.
    const lockResult = await this.userSyncStateService
      .markSyncRunning(firebaseId, triggeredBy)
      .catch(err => {
        this.logger.error(
          `[FullSync] Failed to acquire DB lock | firebaseId=${masked} | error=${err?.message}`,
          err?.stack,
        );
        return { acquired: false }; // safer to skip than to dual-run
      });
    if (!lockResult.acquired) {
      console.log(
        `⏭️  [FullSync] Skipped — another instance already holds the DB lock | triggeredBy=${triggeredBy} | firebaseId=${masked}\n`,
      );
      return;
    }

    const promise = this.doFullSync(firebaseId, triggeredBy, masked, preSyncState).finally(() => {
      this.runningFullSyncByUser.delete(firebaseId);
    });

    this.runningFullSyncByUser.set(firebaseId, promise);
    return promise;
  }

  /** Builds a SourceResult[] from the raw bank + card fetch responses. */
  private buildSourceResults(bankRes: any, cardRes: any): SourceResult[] {
    const results: SourceResult[] = [];

    // Bank accounts — one SourceResult per sub-account. Both maps are now keyed by
    // account.resourceId, so multi-currency sub-accounts on the same IBAN
    // (e.g., ILS + USD) get distinct entries.
    if (bankRes && bankRes !== null) {
      const byAccount: { [accResourceId: string]: any[] } = bankRes.transactionsByAccount ?? {};
      const accountInfoMap: { [accResourceId: string]: any } = bankRes.accountInfoMap ?? {};

      const sourceBuckets = new Map<string, { count: number; consentId: string | undefined; resourceId: string | undefined }>();
      for (const [accResourceId, txs] of Object.entries<any[]>(byAccount)) {
        const acc = accountInfoMap[accResourceId];
        const iban: string | undefined = acc?.iban;
        const rawKey = iban ? iban.slice(-7) : accResourceId;
        const sourceId = iban ? this.deriveSourceName(rawKey, acc?.currency) : rawKey;
        const existing = sourceBuckets.get(sourceId);
        const count = (existing?.count ?? 0) + (Array.isArray(txs) ? txs.length : 0);
        sourceBuckets.set(sourceId, {
          count,
          consentId: existing?.consentId ?? acc?.consentId ?? acc?.relatedConsents?.[0]?.resourceId ?? undefined,
          resourceId: existing?.resourceId ?? acc?.resourceId ?? undefined,
        });
      }

      // Scale raw per-source counts to post-consent-filter total so SYNC RESULTS shows valid counts.
      const bankRawTotal = Array.from(sourceBuckets.values()).reduce((sum, b) => sum + b.count, 0);
      const bankValidTotal = (bankRes.normalizedTransactions as any[] ?? []).length;
      const scale = bankRawTotal > 0 ? bankValidTotal / bankRawTotal : 0;

      for (const [sourceId, bucket] of sourceBuckets) {
        results.push({
          type: 'bank',
          sourceId,
          resourceId: bucket.resourceId,
          consentId: bucket.consentId,
          status: 'success',
          transactionCount: Math.round(bucket.count * scale),
        });
      }

      // Bank accounts — failed entries. err.currency is now propagated from the fetcher,
      // so the failed sourceId can include the currency suffix to match the right Source row.
      for (const err of bankRes.bankErrors ?? []) {
        const ibanRaw = err.iban ? err.iban.slice(-7) : null;
        const sourceId = ibanRaw ? this.deriveSourceName(ibanRaw, err.currency ?? null) : (err.sourceId ?? 'unknown');
        results.push({
          type: 'bank',
          sourceId,
          status: 'failed',
          transactionCount: 0,
          error: err.message,
        });
      }
    }

    // Credit cards — success entries
    if (cardRes && cardRes !== null) {
      // Scale raw per-card counts to post-dedup normalized total (mirrors bank scaling above).
      const cardRawTotal = (cardRes.cards ?? []).reduce(
        (sum: number, c: any) => sum + (Array.isArray(c.transactions) ? c.transactions.length : 0), 0,
      );
      const cardValidTotal = (cardRes.normalizedTransactions as any[] ?? []).length;
      const cardScale = cardRawTotal > 0 ? cardValidTotal / cardRawTotal : 0;

      for (const card of cardRes.cards ?? []) {
        const pan   = card.maskedPan ?? '';
        const last4 = pan.slice(-4) || card.cardResourceId;
        const sourceId = pan ? this.deriveSourceName(last4, card.currency) : last4;
        const rawCardCount = Array.isArray(card.transactions) ? card.transactions.length : 0;
        results.push({
          type: 'card',
          sourceId,
          resourceId: card.cardResourceId,
          consentId:  card.consentId ?? undefined,
          status: 'success',
          transactionCount: Math.round(rawCardCount * cardScale),
        });
      }
      // Credit cards — failed entries
      for (const err of cardRes.cardErrors ?? []) {
        const pan   = err.maskedPan ?? '';
        const last4 = pan.slice(-4) || err.cardResourceId;
        // err.currency is propagated by the fetcher, so the failed sourceId carries the
        // suffix and matches the corresponding Source row correctly.
        const sourceId = pan ? this.deriveSourceName(last4, err.currency ?? null) : last4;
        results.push({
          type: 'card',
          sourceId,
          resourceId: err.cardResourceId,
          consentId:  err.consentId ?? undefined,
          status: 'failed',
          transactionCount: 0,
          error: err.message,
        });
      }
    }

    return results;
  }

  /**
   * Evaluates the outcome quality of a single sync phase (Quick or Full) from
   * the raw results returned by getAndSaveBankTransactions and getAndSaveUserCardTransactions.
   *
   * Returns the backend-facing resultStatus only. The frontend-facing processStatus
   * is determined by the orchestration layer (doFullSync) after persistence, so
   * that it can account for normalizedTransactions.length cleanly.
   *
   * resultStatus values:
   *   'success'         — no errors; all normalized transactions persisted
   *   'partial_success' — some accounts/cards failed but normalized transactions still exist and are persisted
   *   'failed'          — errors occurred and no normalized transactions were produced; nothing persisted
   *
   * CONSENT_REQUIRED is explicitly treated as a bank error (→ failed if no card data).
   * This method has no side effects and does not touch the DB.
   */
  private computePhaseStatus(
    bankRes: any,
    cardRes: any,
  ): {
    resultStatus: 'success' | 'partial_success' | 'failed';
    normalizedTransactions: NormalizedTransaction[];
    hasErrors: boolean;
    diagnostics: {
      errors: string[];
      bankAccountsProcessed: number;
      bankAccountsFailed: number;
      cardsFailed: number;
      cardsSucceeded: number;
      bankNormalized: number;
      cardNormalized: number;
    };
  } {
    const errors: string[] = [];

    // ── Bank error signals ─────────────────────────────────────────────────────
    if (bankRes === null) {
      errors.push('bank_fetch_failed');
    } else {
      if (bankRes?.error === 'CONSENT_REQUIRED') {
        // No bank accounts connected — treat as a bank-level failure.
        errors.push('bank_consent_required');
      }
      if ((bankRes?.accountsFailed ?? 0) > 0) {
        errors.push(`bank_accounts_failed:${bankRes.accountsFailed}`);
      }
      if (bankRes?.processingError) {
        errors.push(`bank_normalize_error:${bankRes.processingError}`);
      }
    }

    // ── Card error signals ─────────────────────────────────────────────────────
    if (cardRes === null) {
      errors.push('card_fetch_failed');
    } else {
      if ((cardRes?.cardErrors?.length ?? 0) > 0) {
        errors.push(`card_errors:${cardRes.cardErrors.length}`);
      }
      if (cardRes?.processingError) {
        errors.push(`card_normalize_error:${cardRes.processingError}`);
      }
    }

    const hasErrors = errors.length > 0;

    const normalizedTransactions: NormalizedTransaction[] = [
      ...((bankRes?.normalizedTransactions as NormalizedTransaction[]) ?? []),
      ...((cardRes?.normalizedTransactions as NormalizedTransaction[]) ?? []),
    ];

    let resultStatus: 'success' | 'partial_success' | 'failed';
    if (!hasErrors) {
      resultStatus = 'success';
    } else if (normalizedTransactions.length > 0) {
      resultStatus = 'partial_success';
    } else {
      resultStatus = 'failed';
    }

    return {
      resultStatus,
      normalizedTransactions,
      hasErrors,
      diagnostics: {
        errors,
        bankAccountsProcessed: bankRes?.accountsProcessed ?? 0,
        bankAccountsFailed: bankRes?.accountsFailed ?? 0,
        cardsFailed: cardRes?.cardErrors?.length ?? 0,
        cardsSucceeded: cardRes?.cardsSucceeded ?? 0,
        bankNormalized: ((bankRes?.normalizedTransactions as NormalizedTransaction[]) ?? []).length,
        cardNormalized: ((cardRes?.normalizedTransactions as NormalizedTransaction[]) ?? []).length,
      },
    };
  }

  private async doFullSync(firebaseId: string, triggeredBy: 'login' | 'webhook' | 'manual', masked: string, preSyncState?: UserSyncState | null): Promise<void> {
    try {
      // Gate — requires BOTH: subscription plan includes OPEN_BANKING, AND
      // the user has actually completed OB onboarding (connected a bank
      // account). Plan access alone isn't enough — there's nothing to sync
      // until hasOpenBanking is true.
      const user = await this.userRepository.findOne({ where: { firebaseId }, select: ['fName', 'lName', 'hasOpenBanking'] });
      const hasPlanAccess = await this.billingService.hasModuleAccess(firebaseId, ModuleName.OPEN_BANKING);
      if (!hasPlanAccess || !user?.hasOpenBanking) {
        console.log(`⏭️  [FullSync] Skipped — no OPEN_BANKING access | planAccess=${hasPlanAccess} | hasOpenBanking=${user?.hasOpenBanking} | triggeredBy=${triggeredBy} | firebaseId=${masked}\n`);
        await this.userSyncStateService.markSyncSkipped(firebaseId, 'no_access').catch(err => {
          this.logger.error(`[FullSync] Failed to write skipped(no_access) state | firebaseId=${masked} | error=${err?.message}`);
        });
        return;
      }

      // Log #4 gate — use the pre-markSyncRunning state captured in triggerFullSync so we see
      // the true state before 'running' was written (avoids false "not empty" reads).
      const syncState = preSyncState !== undefined ? preSyncState : await this.userSyncStateService.getSyncState(firebaseId);
      // A previous sync has run (or is running) when status is in a terminal-or-running state.
      // 'failed' is intentionally included so a failed webhook sync doesn't bypass the retry path.
      const NON_FRESH_STATUSES = ['completed', 'running', 'failed'];
      const syncHasRun = !!syncState &&
        NON_FRESH_STATUSES.includes(syncState.fullProcessStatus as string);
      // Only LOGIN respects the cache: if a prior sync exists it either retries
      // pending sources or skips. MANUAL always runs a fresh full sync
      // regardless of cache (explicit user intent). WEBHOOK always forces a
      // fresh sync (Feezback signaled new data is ready).
      if (syncHasRun && triggeredBy === 'login') {
        const sourceRows = await this.userSyncStateService.getSourceResults(firebaseId);
        const pendingSources = sourceRows.filter(
          s => s.status === 'failed' || s.status === 'not_synced',
        );
        if (pendingSources.length > 0) {
          console.log(`🔁 [FullSync] Cache exists but ${pendingSources.length} source(s) pending (failed/not_synced) — retrying | firebaseId=${masked}`);
          await this.retryFailedSources(firebaseId, pendingSources, masked);
          return;
        }
        // Only truly skip when sync completed successfully
        if (syncState.fullProcessStatus === 'completed') {
          console.log(`⏭️  [FullSync] Skipped — cache_exists | status=${syncState.fullProcessStatus} | triggeredBy=${triggeredBy} | firebaseId=${masked}\n`);
          await this.userSyncStateService.markSyncSkipped(firebaseId, 'cache_exists').catch(err => {
            this.logger.error(`[FullSync] Failed to write skipped(cache_exists) state | firebaseId=${masked} | error=${err?.message}`);
          });
          return;
        }
        // Failed with no recoverable sourceResults — run a fresh sync
        console.log(`🔁 [FullSync] Previous sync failed with no recoverable sources — running fresh | firebaseId=${masked}`);
      }
      if (syncHasRun && triggeredBy === 'webhook') {
        console.log(`🔁 [FullSync] Forcing sync — webhook override | firebaseId=${masked}`);
      }

      const sub = `${firebaseId}_sub`;
      const userName = [user?.fName, user?.lName].filter(Boolean).join(' ') || masked;
      const tTotal = Date.now();

      const window = this.getSyncWindow();

      // Inner helper — fetch bank + cards for one date window, process, persist source results.
      const runPass = async (from: string, to: string, label: string) => {
        console.log(`\n════════════════════════════════════`);
        console.log(`  ${label}`);
        console.log(`  User : ${userName}`);
        console.log(`  Dates: ${from} → ${to}`);
        console.log(`════════════════════════════════════`);
        const tPull = Date.now();
        const [bankRes, cardRes] = await Promise.all([
          this.getAndSaveBankTransactions(firebaseId, sub, 'booked', from, to)
            .catch(e => { this.logger.error(`[${label}] Bank pull failed | error=${e?.message ?? e}`, e?.stack); return null; }),
          this.getAndSaveUserCardTransactions(firebaseId, sub, 'booked', from, to)
            .catch(e => { this.logger.error(`[${label}] Card pull failed | error=${e?.message ?? e}`, e?.stack); return null; }),
        ]);
        console.log(`  Pull — bank=${((bankRes?.__durationMs ?? 0) / 1000).toFixed(2)}s card=${((cardRes?.__durationMs ?? 0) / 1000).toFixed(2)}s total=${((Date.now() - tPull) / 1000).toFixed(2)}s\n`);

        const phase = this.computePhaseStatus(bankRes, cardRes);
        let rowsWritten = 0;
        let processStatus: import('../transactions/user-sync-state.entity').ProcessStatus;

        if (phase.normalizedTransactions.length > 0) {
          console.log(`════════════════════════════════════`);
          console.log(`  ${label} — Process transactions`);
          console.log(`  Valid (after consent filter): ${phase.normalizedTransactions.length}${phase.hasErrors ? ` (partial — errors: ${phase.diagnostics.errors.join(', ')})` : ''}`);
          console.log(`════════════════════════════════════`);
          const tDb = Date.now();
          const pr = await this.processingService.process(firebaseId, phase.normalizedTransactions);
          rowsWritten = pr.newlySavedToCache;
          const dedupNote = pr.deduplicatedCount > 0 ? ` | deduped=${pr.deduplicatedCount}` : '';
          console.log(`  ✓ Process done — ${((Date.now() - tDb) / 1000).toFixed(2)}s | saved=${pr.newlySavedToCache} | cached=${pr.alreadyExistingInCache}${dedupNote}\n`);
          processStatus = 'completed';
        } else if (!phase.hasErrors) {
          console.log(`  ℹ ${label} — no transactions in date range\n`);
          processStatus = 'completed';
        } else {
          this.logger.warn(`[${label}] No transactions and errors — marking failed | errors=${JSON.stringify(phase.diagnostics.errors)}`);
          processStatus = 'failed';
        }

        const sourceResults = this.buildSourceResults(bankRes, cardRes);
        await this.userSyncStateService.updateSourceResults(firebaseId, sourceResults).catch(() => {});

        console.log(`════════════════════════════════════`);
        console.log(`  SYNC RESULTS [${label}] — ${processStatus === 'completed' ? '✅ OK' : '⚠️  ERRORS'}`);
        console.log(`════════════════════════════════════`);
        for (const r of sourceResults) {
          const icon = r.status === 'success' ? '✓' : '✗';
          const typeLabel = r.type === 'bank' ? 'Bank' : 'Card';
          const id = r.type === 'bank' ? r.sourceId : `*${r.sourceId}`;
          const detail = r.status === 'success'
            ? `SUCCESS — ${r.transactionCount} transactions`
            : `FAILED — ${r.error ?? 'unknown'}`;
          console.log(`  ${icon}  ${typeLabel.padEnd(4)} ${id.padEnd(20)} ${detail}`);
        }
        if (sourceResults.length === 0) console.log(`  (no sources)`);
        console.log(`════════════════════════════════════\n`);

        return { phase, rowsWritten, processStatus };
      };

      const syncLabel = triggeredBy === 'webhook'
        ? 'WEBHOOK SYNC'
        : triggeredBy === 'login'
          ? 'LOGIN SYNC'
          : 'FULL SYNC';

      const result = await runPass(window.from, window.to, syncLabel);

      // ── Auto-retry sources that failed in the initial pass ──────────────
      // 5s between attempts, up to 2 retries (3 attempts total per source).
      let finalProcessStatus = result.processStatus;
      let finalResultStatus: 'success' | 'partial_success' | 'failed' = result.phase.resultStatus;
      let finalFailureReason = result.phase.hasErrors
        ? result.phase.diagnostics.errors.join(', ')
        : undefined;

      const afterPass = await this.userSyncStateService
        .getSourceResults(firebaseId)
        .catch(() => [] as SourceResult[]);
      const failedAfterPass = afterPass.filter(s => s.status === 'failed');
      if (failedAfterPass.length > 0) {
        await this.autoRetryFailedSources(firebaseId, failedAfterPass, masked);
        const afterRetry = await this.userSyncStateService
          .getSourceResults(firebaseId)
          .catch(() => afterPass);
        const stillFailed = afterRetry.filter(s => s.status === 'failed');
        if (stillFailed.length === 0 && afterRetry.length > 0) {
          // Every previously-failed source recovered on retry.
          finalProcessStatus = 'completed';
          finalResultStatus = 'success';
          finalFailureReason = undefined;
          console.log(`  ✓ [AutoRetry] all previously-failed sources recovered | firebaseId=${masked}`);
        } else if (stillFailed.length > 0) {
          finalFailureReason = stillFailed
            .map(s => `${s.type}:${s.sourceId} ${s.error ?? 'unknown'}`)
            .join(', ');
          console.log(`  ✗ [AutoRetry] ${stillFailed.length} source(s) still failed after retries | firebaseId=${masked}`);
        }
      }

      console.log(`  DONE | ${result.rowsWritten} saved | total=${((Date.now() - tTotal) / 1000).toFixed(2)}s\n`);
      await this.userSyncStateService.markSyncFinished(
        firebaseId, finalProcessStatus, finalResultStatus, result.rowsWritten,
        finalFailureReason,
      ).catch(err => this.logger.error(`[${syncLabel}] Failed to write finished state | firebaseId=${masked} | error=${err?.message}`));

    } catch (err: any) {
      console.error(`\n❌ [FullSync] FAILED | triggeredBy=${triggeredBy} | firebaseId=${masked} | error=${err?.message ?? err}\n`);
      this.logger.error(`[FullSync] Failed | triggeredBy=${triggeredBy} | firebaseId=${masked} | error=${err?.message ?? err}`, err?.stack);
      await this.userSyncStateService.markSyncFailed(firebaseId, err?.message ?? 'UNKNOWN_ERROR').catch(writeErr => {
        this.logger.error(`[FullSync] Failed to write failed state | firebaseId=${masked} | error=${writeErr?.message}`);
      });
    }
  }

  /**
   * Called on login when cache exists but some sources failed in the previous sync.
   * Retries all failed sources in parallel, then marks the sync completed.
   * The frontend poller sees running → completed with updated sourceResults.
   */
  private async retryFailedSources(firebaseId: string, failedSources: SourceResult[], masked: string): Promise<void> {
    // Mark as running first so frontend polling sees the state transition
    await this.userSyncStateService.markSyncRunning(firebaseId, 'manual').catch(err =>
      this.logger.error(`[RetryFailedSources] Failed to write running state | firebaseId=${masked} | error=${err?.message}`),
    );

    console.log(`\n════════════════════════════════════`);
    console.log(`  RETRY FAILED SOURCES`);
    console.log(`  Count : ${failedSources.length}`);
    console.log(`  Sources: ${failedSources.map(s => `${s.type}:${s.sourceId}`).join(', ')}`);
    console.log(`════════════════════════════════════`);
    const tStart = Date.now();

    await Promise.all(
      failedSources.map(source =>
        this.retrySource(firebaseId, source.type, source.sourceId).catch(err => {
          console.error(`  ✗ ${source.type} "${source.sourceId}" — retry threw: ${err?.message}`);
        }),
      ),
    );

    console.log(`  ✓ All retries done — ${((Date.now() - tStart) / 1000).toFixed(2)}s`);
    console.log(`════════════════════════════════════\n`);

    await this.userSyncStateService.markSyncFinished(firebaseId, 'completed', 'none', 0)
      .catch(err => this.logger.error(`[RetryFailedSources] Failed to write finished state | firebaseId=${masked} | error=${err?.message}`));
  }

  /**
   * Auto-retry sources that failed in the initial sync pass.
   *
   * For each failed source: waits AUTO_RETRY_DELAY_MS then re-fetches it via
   * retrySource(), up to AUTO_RETRY_MAX extra attempts. Combined with the
   * initial pass this gives AUTO_RETRY_MAX + 1 attempts total per source
   * (default: 1 initial + 2 retries = 3). Stops early once a source succeeds.
   * retrySource() itself persists the per-source state and processes the
   * fetched transactions, so the DB is authoritative after this returns.
   */
  private async autoRetryFailedSources(
    firebaseId: string,
    failedSources: SourceResult[],
    masked: string,
  ): Promise<void> {
    const AUTO_RETRY_MAX = 2;        // extra attempts after the initial pass
    const AUTO_RETRY_DELAY_MS = 5000; // 5s between attempts
    const totalAttempts = AUTO_RETRY_MAX + 1;

    for (const source of failedSources) {
      const typeLabel = source.type === 'bank' ? 'Bank' : 'Card';
      const id = source.type === 'bank' ? source.sourceId : `*${source.sourceId}`;
      let current = source;

      // attempt #1 was the initial pass; retries are attempts 2..totalAttempts
      for (let attempt = 2; attempt <= totalAttempts; attempt++) {
        await this.sleep(AUTO_RETRY_DELAY_MS);
        console.log(
          `\n🔁 [AutoRetry] ${typeLabel} ${id} — attempt ${attempt}/${totalAttempts} | firebaseId=${masked}`,
        );
        current = await this.retrySource(firebaseId, source.type, source.sourceId).catch(
          (err: any) => {
            console.error(
              `  ✗ [AutoRetry] ${typeLabel} ${id} attempt ${attempt}/${totalAttempts} threw: ${err?.message ?? err}`,
            );
            return { ...source, status: 'failed' as const, error: err?.message ?? 'unknown' };
          },
        );
        console.log(
          `  ${current.status === 'success' ? '✓' : '✗'} [AutoRetry] ${typeLabel} ${id} attempt ${attempt}/${totalAttempts} → ${current.status}`,
        );
        if (current.status === 'success') break;
      }
    }
  }

  /**
   * Per-account primitive — pulls transactions for ONE source without calling
   * getUserAccounts.
   *
   *  - bank: reconstructs the per-account transactions URL from the stored
   *    consentId + resourceId (same URL Feezback returns in
   *    _links.transactions.href; mirrors how cards are fetched). It is per
   *    sub-account so every returned tx belongs to this one `sourceId`. The
   *    normalizer's IBAN-based account attribution is irrelevant here — we
   *    simply overwrite `paymentIdentifier = sourceId` on every normalized row,
   *    then process + persist. No iban/currency/href needed.
   *  - card: delegates to the existing single-card path (already an efficient
   *    resourceId-based single fetch).
   *
   * On ANY failure (missing stored ref, fetch/normalize error) it returns a
   * failed SourceResult and persists it. It NEVER falls back to
   * getUserAccounts — discovery is the only place that refreshes the stored
   * href/consentId. Uses the full one-year sync window.
   */
  /** Human-readable label for sync logs: "First Last" or masked firebaseId. */
  private async resolveUserLabel(firebaseId: string): Promise<string> {
    const masked = firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?');
    const user = await this.userRepository
      .findOne({ where: { firebaseId }, select: ['fName', 'lName'] })
      .catch(() => null);
    return [user?.fName, user?.lName].filter(Boolean).join(' ') || masked;
  }

  async pullOneSource(
    firebaseId: string,
    type: 'bank' | 'card',
    sourceId: string,
  ): Promise<SourceResult> {
    const sub = `${firebaseId}_sub`;
    const { from: dateFrom, to: dateTo } = this.getSyncWindow();

    // Card: reuse the proven single-card path (resourceId-based, no re-pull-all).
    if (type === 'card') {
      return this.retrySource(firebaseId, 'card', sourceId);
    }

    const userName = await this.resolveUserLabel(firebaseId);

    const rows = await this.userSyncStateService.getSourceResults(firebaseId);
    const row = rows.find(r => r.sourceId === sourceId && r.type === 'bank');

    const fail = async (error: string): Promise<SourceResult> => {
      const result: SourceResult = { type: 'bank', sourceId, status: 'failed', transactionCount: 0, error };
      await this.userSyncStateService.updateSourceResults(firebaseId, [result]).catch(() => {});
      return result;
    };

    if (!row) return fail('source not found in user_source_sync_state — run discovery first');
    if (!row.consentId) return fail('no consentId stored — run discovery (getUserAccounts) first');
    if (!row.resourceId) return fail('no resourceId stored — run discovery (getUserAccounts) first');

    console.log(`\n[PullOneSource] Bank | user=${userName} | sourceId=${sourceId} | dates=${dateFrom}→${dateTo}`);
    try {
      // Reconstruct the per-account URL from sub + consentId + resourceId
      // (same shape Feezback returns in _links.transactions.href; mirrors how
      // card transactions are fetched). No stored href / no getUserAccounts.
      const resp = await this.feezbackConsentApiService.getAccountTransactionsByConsent(
        sub, row.consentId, row.resourceId, 'booked', dateFrom, dateTo,
      );
      const rawTransactions = this.extractBankTransactions(resp);

      // This endpoint is per sub-account, so every tx here belongs to this
      // exact `sourceId`. We don't stamp __accountIban (the normalizer keeps
      // txs with no IBAN stamp and we don't want its consent-IBAN drop), and we
      // override paymentIdentifier directly below — so account maps can be empty.
      const normalized = this.normalizeBankTransactions(
        rawTransactions,
        {},
        {},
        new Set<string>(),
        true, // single-account mode → suppress expected missing-IBAN log
      );
      for (const n of normalized) {
        n.paymentIdentifier = sourceId;
      }

      if (normalized.length > 0) {
        await this.processingService.process(firebaseId, normalized);
      }

      const result: SourceResult = {
        type: 'bank',
        sourceId,
        resourceId: row.resourceId ?? undefined,
        consentId: row.consentId ?? undefined,
        status: 'success',
        transactionCount: normalized.length,
        // Full raw Feezback response (account/asOf/transactions.booked+pending).
        // Transient — updateSourceResults ignores it, so it never hits the DB.
        rawTransactionsResponse: resp,
      };
      await this.userSyncStateService.updateSourceResults(firebaseId, [result]).catch(() => {});
      console.log(`  ✓ Bank ${sourceId} (${userName}) — success | count=${normalized.length}`);
      return result;
    } catch (err: any) {
      console.log(`  ✗ Bank ${sourceId} (${userName}) — failed | error=${err?.message ?? err}`);
      return fail(err?.message ?? 'unknown');
    }
  }

  /**
   * Retries a single bank account or credit card fetch.
   * Uses the full one-year sync window (same as a full sync).
   */
  async retrySource(
    firebaseId: string,
    type: 'bank' | 'card',
    sourceId: string,
  ): Promise<SourceResult> {
    const sub = `${firebaseId}_sub`;
    const { from: dateFrom, to: dateTo } = this.getSyncWindow();

    if (type === 'card') {
      const userName = await this.resolveUserLabel(firebaseId);
      const dbSources = await this.userSyncStateService.getSourceResults(firebaseId);
      const dbSource = dbSources.find(s => s.sourceId === sourceId && s.type === 'card');
      const cardResourceId = dbSource?.resourceId;
      if (!cardResourceId) {
        // Disambiguate the failure so the cause is unmistakable in logs/JSON:
        //  - no row at all for this sourceId (sourceId mismatch or never discovered)
        //  - row exists but resourceId is still null (discovery hasn't filled it)
        const knownCardIds = dbSources.filter(s => s.type === 'card').map(s => s.sourceId);
        const error = !dbSource
          ? `no card row for sourceId='${sourceId}' (known card sourceIds: [${knownCardIds.join(', ')}]) — sourceId mismatch or not discovered`
          : `card row exists for sourceId='${sourceId}' but resourceId is null — discovery has not populated it yet`;
        console.log(`  ✗ Card *${sourceId} (${userName}) — failed | ${error}`);
        const result: SourceResult = { type: 'card', sourceId, status: 'failed', transactionCount: 0, error };
        await this.userSyncStateService.updateSourceResults(firebaseId, [result]).catch(() => {});
        return result;
      }

      console.log(`\n[RetrySource] Card | user=${userName} | sourceId=${sourceId} | resourceId=${cardResourceId} | dates=${dateFrom}→${dateTo}`);
      try {
        const cardRes = await this.getAndSaveUserCardTransactionsInternal(
          firebaseId, sub, 'booked', dateFrom, dateTo, cardResourceId,
        );
        const succeeded = cardRes.cards?.find((c: any) => c.cardResourceId === cardResourceId);
        const failed = cardRes.cardErrors?.find((e: any) => e.cardResourceId === cardResourceId);

        const result: SourceResult = succeeded
          ? { type: 'card', sourceId, resourceId: cardResourceId, status: 'success', transactionCount: succeeded.transactions?.length ?? 0, rawTransactionsResponse: succeeded.rawResponse }
          : { type: 'card', sourceId, resourceId: cardResourceId, status: 'failed', transactionCount: 0, error: failed?.message };

        console.log(`  ${result.status === 'success' ? '✓' : '✗'} Card *${sourceId} (${userName}) — ${result.status} | count=${result.transactionCount}`);

        if (result.status === 'success' && cardRes.normalizedTransactions?.length > 0) {
          await this.processingService.process(firebaseId, cardRes.normalizedTransactions);
        }
        await this.userSyncStateService.updateSourceResults(firebaseId, [result]).catch(() => {});
        if (result.status === 'success') {
          // Open the fetch gate so the user sees what they just pulled.
          await this.userSyncStateService.markCacheReadyAfterSourcePull(firebaseId).catch(() => {});
        }
        return result;
      } catch (err: any) {
        const result: SourceResult = { type: 'card', sourceId, status: 'failed', transactionCount: 0, error: err?.message };
        await this.userSyncStateService.updateSourceResults(firebaseId, [result]).catch(() => {});
        return result;
      }
    }

    // Bank: route through the per-account primitive — fetches ONLY this one
    // account via stored consentId + resourceId (no getUserAccounts re-pull).
    const bankResult = await this.pullOneSource(firebaseId, 'bank', sourceId);
    if (bankResult.status === 'success') {
      // Open the fetch gate so the user sees what they just pulled.
      await this.userSyncStateService.markCacheReadyAfterSourcePull(firebaseId).catch(() => {});
    }
    return bankResult;
  }

}
