import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AgentHarnessUser } from '../agent-harness/agent-harness.service';
import { AgentDomainService } from '../agent-harness/agent-domain.service';
import { AgentClassificationService } from '../agent-harness/agent-classification.service';
import { CatalogContextService } from '../bookkeeping/catalog-context.service';
import { CatalogService } from '../bookkeeping/catalog.service';
import { BillingService } from '../billing/services/billing.service';
import { ApprovalStatus, ModuleName } from '../enum';
import { User } from '../users/user.entity';
import { FullTransactionCache } from '../transactions/full-transaction-cache.entity';
import { ClassifiedTransactions } from '../transactions/classified-transactions.entity';
import { TransactionProcessingService } from '../transactions/transaction-processing.service';
import { decode, ProfileRow } from '../agent-onboarding/onboarding.domain';
import {
  assertSelf,
  automationMissing,
  fingerprint,
} from './auto-classification.policy';
import { AutoClassificationModel } from './auto-classification.model';

export const autoIdentity = (owner: string): AgentHarnessUser => ({
  firebaseId: owner,
  actorFirebaseId: owner,
  businessNumber: null,
  delegationScopes: [],
  isDelegatedAccess: false,
  isAdminImpersonation: false,
});
const lockName = 'keepintax:auto-classification:v1';
const unavailable = () =>
  new ServiceUnavailableException('הסיווג האוטומטי טרם הופעל בסביבה הזאת');

@Injectable()
export class AutoClassificationService {
  private busy = false;
  private readonly logger = new Logger(AutoClassificationService.name);
  constructor(
    private readonly db: DataSource,
    private readonly domain: AgentDomainService,
    private readonly classification: AgentClassificationService,
    private readonly processing: TransactionProcessingService,
    private readonly catalog: CatalogService,
    private readonly catalogContext: CatalogContextService,
    private readonly billing: BillingService,
    private readonly model: AutoClassificationModel,
  ) {}
  enabled() {
    return (
      process.env.AGENT_AUTO_CLASSIFICATION_ENABLED === 'true' &&
      process.env.AGENT_ONBOARDING_ENABLED === 'true'
    );
  }
  private check(user: AgentHarnessUser) {
    assertSelf(user);
    if (!this.enabled()) throw unavailable();
  }
  private async connected(owner: string) {
    const row = await this.db
      .getRepository(User)
      .findOne({ where: { firebaseId: owner } });
    return (
      !!row?.hasOpenBanking &&
      (await this.billing.hasModuleAccess(
        owner,
        ModuleName.OPEN_BANKING,
        false,
        false,
      ))
    );
  }
  async profile(
    owner: string,
    business: string,
    manager: Pick<EntityManager, 'query'> = this.db,
    lock = false,
  ) {
    const rows: ProfileRow[] = await manager.query(
      `SELECT * FROM agent_onboarding_profiles WHERE owner_uid=? AND scope_key IN ('',?) ORDER BY scope_key${
        lock ? ' FOR UPDATE' : ''
      }`,
      [owner, business],
    );
    rows.forEach((r) => (r.field_states = decode(r.field_states)));
    const person = rows.find((r) => r.scope_key === ''),
      work = rows.find((r) => r.scope_key === business);
    return {
      missing: automationMissing(person, work),
      version: fingerprint(
        rows.map((r) => [r.scope_key, r.version, r.field_states]),
      ),
      context: { personal: person?.story ?? '', business: work?.story ?? '' },
    };
  }
  async status(user: AgentHarnessUser) {
    assertSelf(user);
    if (!this.enabled())
      return {
        available: false,
        enabled: false,
        connected: false,
        businesses: [],
        unlinked: [],
        bills: [],
        counts: [],
        noticeSeen: true,
        lastError: null,
      };
    const owner = user.firebaseId;
    const prefs = await this.db.query(
      'SELECT * FROM agent_auto_preferences WHERE owner_uid=?',
      [owner],
    );
    const businesses = await this.domain.ownerBusinesses(user);
    const readiness = [];
    for (const b of businesses)
      readiness.push({
        number: b.businessNumber,
        name: b.businessName || b.businessNumber,
        missing: (await this.profile(owner, b.businessNumber)).missing,
      });
    const unlinked = await this.db.query(
      'SELECT id,sourceName,sourceType,connectionRole FROM source WHERE userId=? AND billId IS NULL ORDER BY id',
      [owner],
    );
    const bills = await this.db.query(
      'SELECT id,billName,businessNumber FROM bill WHERE userId=? ORDER BY id',
      [owner],
    );
    const counts = await this.db.query(
      'SELECT state,COUNT(*) AS count FROM agent_auto_items WHERE owner_uid=? GROUP BY state',
      [owner],
    );
    const pending = await this.db.query(
      `SELECT COUNT(*) AS count FROM full_transactions_cache c LEFT JOIN slim_transactions s ON s.userId=c.userId AND s.externalTransactionId=c.externalTransactionId
      WHERE c.userId=? AND c.amount<0 AND c.confirmed=false AND c.isLocked=false AND c.billId IS NOT NULL AND (c.category IS NULL OR c.category='') AND s.id IS NULL`,
      [owner],
    );
    return {
      available: true,
      enabled: !!prefs[0]?.enabled,
      connected: await this.connected(owner),
      businesses: readiness,
      unlinked,
      bills,
      counts,
      pending: Number(pending[0]?.count ?? 0),
      noticeSeen: !!prefs[0]?.notice_seen,
      lastError: prefs[0]?.last_error ?? null,
    };
  }
  async consent(user: AgentHarnessUser, enabled: boolean) {
    this.check(user);
    if (typeof enabled !== 'boolean') throw new BadRequestException();
    if (enabled) {
      if (!(await this.connected(user.firebaseId)))
        throw new ConflictException('נדרש חיבור פעיל לבנקאות פתוחה');
      const businesses = await this.domain.ownerBusinesses(user);
      let ready = false;
      for (const b of businesses)
        if (
          !(await this.profile(user.firebaseId, b.businessNumber)).missing
            .length
        )
          ready = true;
      if (!ready)
        throw new ConflictException(
          'יש להשלים את שדות החובה בהיכרות לפני הפעלת הסיווג',
        );
    }
    await this.db.transaction(async (manager) => {
      await manager.getRepository(User).findOne({
        where: { firebaseId: user.firebaseId },
        lock: { mode: 'pessimistic_write' },
      });
      await manager.query(
        `INSERT INTO agent_auto_preferences(owner_uid,enabled,version,notice_seen) VALUES (?,?,1,true)
        ON DUPLICATE KEY UPDATE enabled=VALUES(enabled),version=version+1,changed_at=NOW(3),scan_cursor=0,next_scan_at=NOW(3),notice_seen=true,last_error=NULL`,
        [user.firebaseId, enabled],
      );
    });
    return this.status(user);
  }
  async dismiss(user: AgentHarnessUser) {
    this.check(user);
    await this.db.query(
      'INSERT INTO agent_auto_preferences(owner_uid,notice_seen) VALUES (?,true) ON DUPLICATE KEY UPDATE notice_seen=true',
      [user.firebaseId],
    );
    return { ok: true };
  }
  async start(user: AgentHarnessUser) {
    this.check(user);
    const result = await this.db.query(
      'UPDATE agent_auto_preferences SET scan_cursor=0,next_scan_at=NOW(3) WHERE owner_uid=? AND enabled=true',
      [user.firebaseId],
    );
    if (!result.affectedRows)
      throw new ConflictException('יש להפעיל סיווג אוטומטי בהגדרות הסוכן');
    return {
      queued: true,
      message: 'הסיווג נוסף לתור. התקדמות ובירורים מופיעים בהגדרות, הסוכן שלי.',
    };
  }
  async inbox(user: AgentHarnessUser, before?: string) {
    this.check(user);
    let cursor: { time: string; id: string } | null = null;
    if (before) {
      try {
        cursor = JSON.parse(Buffer.from(before, 'base64url').toString('utf8'));
      } catch {
        throw new BadRequestException();
      }
      if (
        !cursor ||
        typeof cursor.id !== 'string' ||
        !/^[a-f0-9-]{36}$/.test(cursor.id) ||
        !Number.isFinite(new Date(cursor.time).getTime())
      )
        throw new BadRequestException();
    }
    const rows = await this.db.query(
      `SELECT id,business_number,state,reason,question,display_json,category,sub_category,read_at,updated_at FROM agent_auto_items WHERE owner_uid=? AND state IN ('waiting','classified','failed','blocked','resolved') ${
        cursor ? 'AND (updated_at < ? OR (updated_at = ? AND id < ?))' : ''
      } ORDER BY updated_at DESC,id DESC LIMIT 51`,
      cursor
        ? [
            user.firebaseId,
            new Date(cursor.time),
            new Date(cursor.time),
            cursor.id,
          ]
        : [user.firebaseId],
    );
    const unread = await this.db.query(
      `SELECT COUNT(*) AS count FROM agent_auto_items WHERE owner_uid=? AND read_at IS NULL AND state IN ('waiting','classified','failed','blocked')`,
      [user.firebaseId],
    );
    return {
      items: rows.slice(0, 50).map((r) => ({
        ...r,
        display: decode(r.display_json),
        display_json: undefined,
      })),
      unread: Number(unread[0].count),
      hasMore: rows.length > 50,
      nextCursor:
        rows.length > 50
          ? Buffer.from(
              JSON.stringify({ time: rows[49].updated_at, id: rows[49].id }),
            ).toString('base64url')
          : null,
    };
  }
  async notice(user: AgentHarnessUser, id: string) {
    this.check(user);
    const [row] = await this.db.query(
      'SELECT * FROM agent_auto_items WHERE id=? AND owner_uid=?',
      [id, user.firebaseId],
    );
    if (!row) throw new NotFoundException();
    return {
      ...row,
      display: decode(row.display_json),
      display_json: undefined,
      answer: undefined,
    };
  }
  async read(user: AgentHarnessUser, id: string) {
    this.check(user);
    await this.db.query(
      'UPDATE agent_auto_items SET read_at=NOW(3) WHERE id=? AND owner_uid=?',
      [id, user.firebaseId],
    );
    return { ok: true };
  }
  async reply(user: AgentHarnessUser, id: string, answer: string) {
    this.check(user);
    if (typeof answer !== 'string' || !answer.trim() || answer.length > 2000)
      throw new BadRequestException('יש לכתוב תשובה עד 2000 תווים');
    await this.db.transaction(async (manager) => {
      await manager.getRepository(User).findOne({
        where: { firebaseId: user.firebaseId },
        lock: { mode: 'pessimistic_write' },
      });
      const [pref] = await manager.query(
        'SELECT enabled FROM agent_auto_preferences WHERE owner_uid=? FOR UPDATE',
        [user.firebaseId],
      );
      if (!pref?.enabled)
        throw new ConflictException('יש להפעיל סיווג אוטומטי בהגדרות הסוכן');
      const result = await manager.query(
        `UPDATE agent_auto_items SET answer=?,state='pending',attempts=0,retry_at=NULL,read_at=NOW(3),updated_at=NOW(3) WHERE id=? AND owner_uid=? AND state IN ('waiting','failed','blocked')`,
        [answer.trim(), id, user.firebaseId],
      );
      if (!result.affectedRows)
        throw new ConflictException('ההודעה השתנתה, יש לרענן');
      await manager.query(
        'UPDATE agent_auto_preferences SET scan_cursor=0,next_scan_at=NOW(3) WHERE owner_uid=?',
        [user.firebaseId],
      );
    });
    return { queued: true };
  }
  // Polling is the outbox: discovers committed cache/source changes, even after missed hooks/restarts.
  // One global MySQL advisory lock bounds model concurrency across all backend instances.
  @Interval(15000)
  async tick() {
    if (!this.enabled() || this.busy) return;
    this.busy = true;
    const runner = this.db.createQueryRunner();
    let locked = false;
    try {
      await runner.connect();
      locked =
        Number(
          (
            await runner.query('SELECT GET_LOCK(?,0) AS acquired', [lockName])
          )[0]?.acquired,
        ) === 1;
      if (!locked) return;
      const prefs = await this.db.query(
        'SELECT * FROM agent_auto_preferences WHERE enabled=true AND next_scan_at<=NOW(3) ORDER BY next_scan_at,owner_uid LIMIT 1',
      );
      if (!prefs.length) return;
      const pref = prefs[0],
        owner = pref.owner_uid;
      // Fair rotation is reserved before slow work; no per-user unbounded drain.
      await this.db.query(
        'UPDATE agent_auto_preferences SET next_scan_at=DATE_ADD(NOW(3),INTERVAL 15 SECOND) WHERE owner_uid=?',
        [owner],
      );
      try {
        if (!(await this.connected(owner))) {
          await this.pause(owner, 'BANKING_REQUIRED');
          return;
        }
        const handled = await this.db.query(
          `SELECT i.id FROM agent_auto_items i JOIN slim_transactions s ON s.userId=i.owner_uid AND s.externalTransactionId=i.external_id
          WHERE i.owner_uid=? AND i.state IN ('pending','retry','waiting','blocked','failed') ORDER BY i.id LIMIT 100`,
          [owner],
        );
        if (handled.length)
          await this.db.query(
            `UPDATE agent_auto_items SET state='resolved',question=NULL,reason='התנועה כבר סווגה במערכת. הבירור נסגר.',read_at=COALESCE(read_at,NOW(3)),updated_at=NOW(3)
          WHERE owner_uid=? AND id IN (${handled
            .map(() => '?')
            .join(
              ',',
            )}) AND state IN ('pending','retry','waiting','blocked','failed')`,
            [owner, ...handled.map((row) => row.id)],
          );
        const ids = await this.db.query(
          `SELECT c.id FROM full_transactions_cache c
          LEFT JOIN slim_transactions s ON s.userId=c.userId AND s.externalTransactionId=c.externalTransactionId
          LEFT JOIN agent_auto_items i ON i.owner_uid=c.userId AND i.external_id=c.externalTransactionId
          WHERE c.userId=? AND c.id>? AND c.amount<0 AND c.confirmed=false AND c.isLocked=false AND c.billId IS NOT NULL
          AND (c.category IS NULL OR c.category='') AND s.id IS NULL
          AND (i.id IS NULL OR (i.state IN ('pending','retry') AND (i.retry_at IS NULL OR i.retry_at<=NOW(3))))
          ORDER BY c.id LIMIT 10`,
          [owner, pref.scan_cursor],
        );
        let models = 0;
        for (const { id } of ids) {
          const result = await this.process(owner, id, Number(pref.version));
          if (result === 'model') models++;
          await this.db.query(
            'UPDATE agent_auto_preferences SET scan_cursor=?,last_error=NULL WHERE owner_uid=? AND version=?',
            [id, owner, pref.version],
          );
          if (models >= 3) break;
        }
        if (!ids.length)
          await this.db.query(
            'UPDATE agent_auto_preferences SET scan_cursor=0 WHERE owner_uid=? AND version=?',
            [owner, pref.version],
          );
      } catch {
        await this.pause(owner, 'RETRY_REQUIRED');
        this.logger.warn('AUTO_CLASSIFICATION_RETRY_REQUIRED'); // no profile/payment text in logs
      }
    } catch {
      this.logger.warn('AUTO_CLASSIFICATION_WORKER_UNAVAILABLE');
    } finally {
      if (locked)
        await runner
          .query('SELECT RELEASE_LOCK(?)', [lockName])
          .catch(() => undefined);
      await runner.release().catch(() => undefined);
      this.busy = false;
    }
  }
  private async pause(owner: string, code: string) {
    await this.db.query(
      'UPDATE agent_auto_preferences SET last_error=?,next_scan_at=DATE_ADD(NOW(3),INTERVAL 60 SECOND) WHERE owner_uid=?',
      [code, owner],
    );
  }
  private async catalogFor(owner: string, business: string) {
    return (
      await this.catalog.getMergedExpenseCatalog(
        await this.catalogContext.forUser(owner, business),
      )
    ).filter(
      (r) =>
        r.isPrivate ||
        (!!r.account && r.approvalStatus === ApprovalStatus.APPROVED),
    );
  }
  private async rules(
    owner: string,
    cache: FullTransactionCache,
    manager: Pick<EntityManager, 'getRepository'> = this.db,
  ) {
    return manager.getRepository(ClassifiedTransactions).find({
      where: {
        userId: owner,
        billId: cache.billId,
        transactionName: cache.merchantName,
      },
      take: 1001,
      ...(manager !== this.db
        ? { lock: { mode: 'pessimistic_write' as const } }
        : {}),
    });
  }
  async process(
    owner: string,
    id: number,
    consentVersion: number,
  ): Promise<'model' | 'skip'> {
    const user = autoIdentity(owner);
    const cache = await this.db
      .getRepository(FullTransactionCache)
      .findOne({ where: { id, userId: owner } });
    if (!cache?.businessNumber || !cache.billId) return 'skip';
    const business = cache.businessNumber;
    await this.domain.resolveBusiness(user, business);
    const profile = await this.profile(owner, business);
    if (profile.missing.length) return 'skip';
    const source = await this.db.query(
      'SELECT s.id FROM source s JOIN user_source_sync_state us ON us.sourceRecordId=s.id AND us.userId=s.userId AND us.consentId IS NOT NULL JOIN bill b ON b.id=s.billId AND b.userId=s.userId WHERE s.id=? AND s.userId=? AND b.id=? AND b.businessNumber=?',
      [cache.sourceRecordId, owner, cache.billId, business],
    );
    if (!source.length) return 'skip';
    await this.db.query(
      `INSERT IGNORE INTO agent_auto_items(id,owner_uid,external_id,business_number,display_json) VALUES (?,?,?,?,?)`,
      [
        randomUUID(),
        owner,
        cache.externalTransactionId,
        business,
        JSON.stringify({
          merchant: cache.merchantName,
          date: cache.transactionDate,
          amount: cache.amount,
          currency: cache.currency,
          account: cache.billName,
        }),
      ],
    );
    const [item] = await this.db.query(
      'SELECT * FROM agent_auto_items WHERE owner_uid=? AND external_id=?',
      [owner, cache.externalTransactionId],
    );
    if (!['pending', 'retry'].includes(item.state)) return 'skip';
    const catalog = await this.catalogFor(owner, business);
    const rules = await this.rules(owner, cache);
    if (
      rules.length > 1000 ||
      !catalog.length ||
      catalog.length > 500 ||
      JSON.stringify(profile.context).length > 30000
    ) {
      await this.issue(
        item.id,
        'המידע דורש בדיקה לפני יצירת כלל קבוע',
        'אפשר לבדוק ולסווג את התנועה בצ׳אט.',
      );
      return 'skip';
    }
    const rule = this.processing.automaticRule(cache, rules);
    if (rule?.businessNumber && rule.businessNumber !== business) {
      await this.issue(
        item.id,
        'קיים כלל המשייך את התנועה לעסק אחר',
        'יש לבדוק את שיוך העסק בצ׳אט.',
      );
      return 'skip';
    }
    let chosen =
      rule?.subCategoryId ??
      (rule
        ? catalog.find(
            (c) =>
              c.category.name === rule.category && c.name === rule.subCategory,
          )?.id
        : undefined);
    let reason = rule ? 'הוחל כלל סיווג קיים בהתאם לתנאים שלו.' : '';
    let usedModel = false;
    try {
      if (!rule) {
        usedModel = true;
        const history = await this.db.query(
          `SELECT category,subCategory,merchantNameSnapshot AS merchant,transactionDateSnapshot AS date,classificationSource AS source FROM slim_transactions
          WHERE userId=? AND businessNumber=? AND billId=? AND merchantNameSnapshot=? ORDER BY updatedAt DESC LIMIT 20`,
          [owner, business, cache.billId, cache.merchantName],
        );
        const result = await this.model.decide(
          {
            profile: profile.context,
            transaction: {
              merchant: cache.merchantName,
              note: cache.note,
              date: cache.transactionDate,
              amount: cache.amount,
              currency: cache.currency,
            },
            history,
            answer: item.answer,
            categories: catalog.map((c) => ({
              id: c.id,
              category: c.category.name,
              name: c.name,
              private: c.isPrivate,
            })),
          },
          catalog.map((c) => c.id),
        );
        if (result.kind === 'clarify') {
          await this.issue(item.id, result.reason, result.question);
          return 'model';
        }
        chosen = result.subCategoryId;
        reason = result.reason;
      }
      const target = catalog.find((c) => c.id === chosen);
      if (!target) {
        await this.issue(
          item.id,
          'לכלל הקיים חסר סיווג זמין בקטלוג',
          'יש לבדוק את הכלל והקטגוריה בצ׳אט.',
        );
        return usedModel ? 'model' : 'skip';
      }
      const prepared = await this.classification.prepare(user, {
        businessNumber: business,
        externalTransactionId: cache.externalTransactionId,
        subCategoryId: target.id,
      });
      // Prepare still uses a signed snapshot for eligibility/display, but this separate
      // standing-consent boundary does NOT pretend a chat card was approved.
      const dto = JSON.parse(JSON.parse(prepared.proposal).payload).dto;
      await this.processing.classifyPendingForAgent(
        owner,
        cache.externalTransactionId,
        async (current, slim, manager) => {
          const [pref] = await manager.query(
            'SELECT * FROM agent_auto_preferences WHERE owner_uid=? FOR UPDATE',
            [owner],
          );
          const ownerRow = await manager
            .getRepository(User)
            .findOne({ where: { firebaseId: owner } });
          if (
            !this.enabled() ||
            !pref?.enabled ||
            Number(pref.version) !== consentVersion ||
            !ownerRow?.hasOpenBanking ||
            !(await this.billing.hasModuleAccess(
              owner,
              ModuleName.OPEN_BANKING,
              false,
              false,
            ))
          )
            throw new ConflictException('CONSENT_CHANGED');
          const latest = await this.profile(owner, business, manager, true);
          if (latest.missing.length || latest.version !== profile.version)
            throw new ConflictException('PROFILE_CHANGED');
          const [linked] = await manager.query(
            'SELECT s.id FROM source s JOIN user_source_sync_state us ON us.sourceRecordId=s.id AND us.userId=s.userId AND us.consentId IS NOT NULL JOIN bill b ON b.id=s.billId AND b.userId=s.userId WHERE s.id=? AND s.userId=? AND b.id=? AND b.businessNumber=? FOR UPDATE',
            [current.sourceRecordId, owner, current.billId, business],
          );
          if (
            !linked ||
            fingerprint(current) !== fingerprint(cache) ||
            slim ||
            current.confirmed ||
            current.isLocked ||
            Number(current.amount) >= 0 ||
            current.category
          )
            throw new ConflictException('TRANSACTION_CHANGED');
          const nowRules = await this.rules(owner, current, manager);
          if (fingerprint(nowRules) !== fingerprint(rules))
            throw new ConflictException('RULE_CHANGED');
          const nowCatalog = await this.catalogFor(owner, business);
          if (fingerprint(nowCatalog) !== fingerprint(catalog))
            throw new ConflictException('CATALOG_CHANGED');
          await this.domain.resolveBusiness(user, business);
          const [liveItem] = await manager.query(
            'SELECT state FROM agent_auto_items WHERE id=? AND owner_uid=? FOR UPDATE',
            [item.id, owner],
          );
          if (!liveItem || !['pending', 'retry'].includes(liveItem.state))
            throw new ConflictException('ITEM_CHANGED');
          await manager.query(
            `UPDATE agent_auto_items SET state='classified',reason=?,question=NULL,category=?,sub_category=?,read_at=NULL,updated_at=NOW(3),retry_at=NULL WHERE id=? AND owner_uid=?`,
            [reason, dto.category, dto.subCategory, item.id, owner],
          );
          return { dto, result: { status: 'classified' } };
        },
        false,
        { existingRuleId: rule?.id },
      );
    } catch (error) {
      const attempts = Number(item.attempts) + 1;
      const permanent =
        error instanceof ConflictException ||
        error instanceof ForbiddenException ||
        error instanceof NotFoundException ||
        (error as { status?: number })?.status === 423;
      await this.db.query(
        `UPDATE agent_auto_items SET state=?,attempts=?,reason=?,question=?,retry_at=DATE_ADD(NOW(3),INTERVAL 120 SECOND),read_at=NULL,updated_at=NOW(3) WHERE id=? AND state IN ('pending','retry')`,
        [
          permanent ? 'blocked' : attempts >= 3 ? 'failed' : 'retry',
          attempts,
          permanent
            ? 'הנתונים או ההרשאה השתנו. לא בוצע סיווג.'
            : 'הסיווג לא הושלם בגלל תקלה טכנית. לא נבחר סיווג חלופי.',
          permanent ? 'אפשר לבדוק את התנועה ולהמשיך דרך הצ׳אט.' : null,
          item.id,
        ],
      );
    }
    return usedModel ? 'model' : 'skip';
  }
  private async issue(id: string, reason: string, question: string) {
    await this.db.query(
      `UPDATE agent_auto_items SET state='waiting',reason=?,question=?,read_at=NULL,updated_at=NOW(3) WHERE id=? AND state IN ('pending','retry')`,
      [reason, question, id],
    );
  }
}
