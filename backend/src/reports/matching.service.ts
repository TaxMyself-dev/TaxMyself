import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ExtractedDocument, ExtractedDocStatus } from '../documents/extracted-document.entity';
import { SlimTransaction } from '../transactions/slim-transaction.entity';
import { FullTransactionCache } from '../transactions/full-transaction-cache.entity';

/** Matching tolerances. Tuned against Israeli card / bank statements where
 *  the merchant clearing date often drifts a day or two from the invoice
 *  date, and rounding can shift agorot by a few cents. Bumping either side
 *  starts producing false-positive pairs in noisy data. */
const DATE_TOLERANCE_DAYS = 3;
const AMOUNT_TOLERANCE_ILS = 1;

/**
 * One pending tx scoped to a single business + period, joined to its cache
 * row so we have amount + date for matching. The shape is internal — the
 * service hands back nothing; callers re-query via getReportPreview after
 * the matcher has written its links.
 */
interface TxForMatching {
  slimId: number;
  amount: number;          // positive ILS value
  date: Date;
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    @InjectRepository(ExtractedDocument)
    private readonly docRepo: Repository<ExtractedDocument>,
    @InjectRepository(SlimTransaction)
    private readonly slimRepo: Repository<SlimTransaction>,
    @InjectRepository(FullTransactionCache)
    private readonly cacheRepo: Repository<FullTransactionCache>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Pair each pending document with the best-fitting unmatched transaction
   * in the [from, to] window, for one business. Idempotent:
   *   • already-matched documents are skipped (their link survives)
   *   • already-matched transactions are excluded from the candidate pool
   *   • running the matcher twice over the same period produces the same
   *     result (modulo new docs or txs arriving in between)
   *
   * Tolerances: ±3 days on date, ±1 NIS on amount. First-fit, not optimal
   * assignment — a doc that arrives later won't displace an earlier doc's
   * existing link even if it's a tighter fit. That tradeoff keeps the
   * implementation simple and matches user expectations ("nothing I
   * already linked will silently move").
   *
   * All writes happen inside one DB transaction so a crash mid-loop can't
   * leave one side of a pair pointing at the other side without the
   * reverse pointer.
   */
  async matchDocumentsForBusiness(
    firebaseId: string,
    businessNumber: string,
    range: { from: Date; to: Date },
  ): Promise<{ paired: number; docsConsidered: number; txsConsidered: number }> {
    const tag = `biz=${businessNumber} [${range.from.toISOString().slice(0, 10)}..${range.to.toISOString().slice(0, 10)}]`;
    console.log(`[matcher] START ${tag}`);

    // Date filter: only an upper bound (date <= to). The lower bound is
    // intentionally dropped — late-arriving docs from previous periods
    // (e.g. a December invoice that lands in March) should still be
    // reviewable when the user runs a later report; only docs DATED AFTER
    // the period (i.e. belonging to a later period) are excluded. Same
    // rule on the tx-candidate query below.
    const docs = await this.docRepo
      .createQueryBuilder('d')
      .where('d.businessNumber = :bn', { bn: businessNumber })
      .andWhere('d.status = :st', { st: ExtractedDocStatus.PENDING_REVIEW })
      .andWhere('d.matchedTransactionId IS NULL')
      .andWhere('d.date <= :to', { to: range.to })
      .andWhere('d.amount IS NOT NULL')
      .andWhere('d.date IS NOT NULL')
      .getMany();

    if (docs.length === 0) {
      const wider = await this.docRepo
        .createQueryBuilder('d')
        .where('d.businessNumber = :bn', { bn: businessNumber })
        .orderBy('d.date', 'DESC')
        .limit(30)
        .getMany();
      const lines = [`[matcher] 0 candidate docs | wider doc pool for biz=${businessNumber}:`];
      if (wider.length === 0) {
        lines.push(`  (no extracted_document rows for this business — OCR may have failed)`);
      } else {
        for (const d of wider) {
          lines.push(`  docId=${d.id} "${d.supplier ?? '?'}" ${d.date} ${d.amount} ${d.currency ?? 'ILS'} status=${d.status} matched=${d.matchedTransactionId ?? '∅'}`);
        }
      }
      console.log(lines.join('\n'));
      return { paired: 0, docsConsidered: 0, txsConsidered: 0 };
    }

    const docLines = [`[matcher] ${docs.length} doc(s):`];
    for (const d of docs) {
      docLines.push(`  docId=${d.id} "${d.supplier ?? '?'}" ${d.date} ${d.amount} ${d.currency ?? 'ILS'}`);
    }
    console.log(docLines.join('\n'));

    // 2) Candidate transactions: expense-classified, not yet confirmed as
    //    an Expense, not already linked to a document, owned by this
    //    business. Join the cache for amount + date.
    //
    //    `COALESCE(cache.ilsAmount, ABS(cache.amount))` matches the FX
    //    handling everywhere else: ilsAmount is the pre-converted absolute
    //    ILS value for non-ILS rows; for ILS rows it's NULL and we fall
    //    back to ABS(amount) since expense amounts are stored negative.
    const txRows = await this.slimRepo
      .createQueryBuilder('slim')
      .innerJoin(
        FullTransactionCache,
        'cache',
        'cache.userId = slim.userId AND cache.externalTransactionId = slim.externalTransactionId',
      )
      .select([
        'slim.id AS slimId',
        // ABS on BOTH branches: cache.amount is signed (negative for
        // expenses) and so is cache.ilsAmount for non-ILS rows. The doc
        // side is always positive (invoice totals), so we compare
        // magnitudes only.
        'COALESCE(ABS(cache.ilsAmount), ABS(cache.amount)) AS amount',
        'cache.transactionDate AS date',
      ])
      .where('slim.businessNumber = :bn', { bn: businessNumber })
      .andWhere('slim.isRecognized = true')
      .andWhere('slim.confirmed = false')
      .andWhere('slim.matchedDocumentId IS NULL')
      // Upper bound only — see docs query above for rationale.
      .andWhere('cache.transactionDate <= :to', { to: range.to })
      .getRawMany<{ slimId: number; amount: string | number; date: Date | string }>();

    if (txRows.length === 0) {
      // Dump every slim row for THIS USER (any business, any state) so we
      // can spot the common failure modes: row exists but isRecognized=false,
      // confirmed=true, on a different businessNumber, or no slim row at
      // all because classify never reached the DB.
      const wider = await this.slimRepo
        .createQueryBuilder('slim')
        .innerJoin(
          FullTransactionCache,
          'cache',
          'cache.userId = slim.userId AND cache.externalTransactionId = slim.externalTransactionId',
        )
        .select([
          'slim.id AS slimId',
          'slim.isRecognized AS isRecognized',
          'slim.confirmed AS confirmed',
          'slim.matchedDocumentId AS matchedDocumentId',
          'slim.businessNumber AS slimBn',
          'cache.transactionDate AS date',
          'cache.merchantName AS merchantName',
          'COALESCE(ABS(cache.ilsAmount), ABS(cache.amount)) AS amount',
        ])
        .where('slim.userId = :uid', { uid: firebaseId })
        .orderBy('cache.transactionDate', 'DESC')
        .limit(50)
        .getRawMany<any>();
      const lines: string[] = [
        `[matcher] 0 candidate tx for biz=${businessNumber} | wider slim pool for this user:`,
      ];
      if (wider.length === 0) {
        lines.push(`  (none — user has NO slim_transactions rows at all — classify never created them)`);
      } else {
        for (const r of wider) {
          const onTarget = r.slimBn === businessNumber ? '' : ` ⚠ on biz=${r.slimBn ?? '∅'} (not ${businessNumber})`;
          lines.push(
            `  slimId=${r.slimId} "${r.merchantName ?? '?'}" ${r.date} ₪${r.amount} ` +
              `isRecognized=${r.isRecognized} confirmed=${r.confirmed} matched=${r.matchedDocumentId ?? '∅'}${onTarget}`,
          );
        }
      }
      console.log(lines.join('\n'));
      return { paired: 0, docsConsidered: docs.length, txsConsidered: 0 };
    }

    const candidates: TxForMatching[] = txRows.map(r => ({
      slimId: Number(r.slimId),
      amount: Number(r.amount),
      // getRawMany loses runtime type info — MySQL DATE columns come back
      // as ISO strings via the driver, not Date instances. Always wrap.
      date: new Date(r.date as any),
    }));

    const txLines = [`[matcher] ${candidates.length} candidate tx(s):`];
    for (const c of candidates) {
      txLines.push(`  slimId=${c.slimId} ${c.date.toISOString().slice(0, 10)} ₪${c.amount}`);
    }
    console.log(txLines.join('\n'));

    // 3) Pair greedily — first match wins. Track consumed slimIds so a tx
    //    can pair with at most one doc per run. We deliberately don't try
    //    a Hungarian/optimal-assignment match: it's a much heavier
    //    algorithm and the user-visible benefit (a few percent fewer
    //    misalignments) doesn't justify the complexity. If our first-fit
    //    produces too many wrong pairs in practice, we can revisit.
    const consumed = new Set<number>();
    const links: Array<{ docId: number; txId: number }> = [];

    for (const doc of docs) {
      // doc.date is typed `string | null` on the entity but TypeORM may
      // hand back a Date for MySQL DATE columns depending on driver
      // version. Wrap unconditionally — new Date(Date) clones safely.
      const docDate = new Date(doc.date as any);
      // Prefer the ILS-normalized amount (populated at OCR time for
      // non-ILS docs via FxRateService) so the comparison against the
      // tx side — which is also ILS via cache.ilsAmount — is apples to
      // apples. Falls back to doc.amount for ILS docs and pre-migration
      // legacy rows that lack ils_amount.
      const docAmount = doc.ilsAmount != null ? Number(doc.ilsAmount) : Number(doc.amount);

      const match = candidates.find(c => {
        if (consumed.has(c.slimId)) return false;
        if (Math.abs(this.daysBetween(docDate, c.date)) > DATE_TOLERANCE_DAYS) return false;
        if (Math.abs(c.amount - docAmount) > AMOUNT_TOLERANCE_ILS) return false;
        return true;
      });

      if (match) {
        consumed.add(match.slimId);
        links.push({ docId: doc.id, txId: match.slimId });
        console.log(
          `[matcher] PAIRED docId=${doc.id} (${docDate.toISOString().slice(0, 10)}, ${docAmount}) ` +
          `↔ slimId=${match.slimId} (${match.date.toISOString().slice(0, 10)}, ₪${match.amount}) | ${tag}`,
        );
      } else {
        console.log(
          `[matcher] NO MATCH docId=${doc.id} (${docDate.toISOString().slice(0, 10)}, ${docAmount}) — ` +
          `tried ${candidates.length} candidate(s), none within ±${DATE_TOLERANCE_DAYS}d / ±${AMOUNT_TOLERANCE_ILS}₪ | ${tag}`,
        );
      }
    }

    if (links.length === 0) {
      console.log(
        `[matcher] DONE 0 pairs | considered ${docs.length} docs × ${candidates.length} txs | ${tag}`,
      );
      return { paired: 0, docsConsidered: docs.length, txsConsidered: candidates.length };
    }

    // 4) Write all pairs in one DB transaction. Two updates per pair (doc
    //    + tx); if any fails, none persist, so we never get the dangling
    //    "doc points to tx, tx doesn't point back" state that would
    //    confuse the review UI.
    await this.dataSource.transaction(async manager => {
      const docTx = manager.getRepository(ExtractedDocument);
      const slimTx = manager.getRepository(SlimTransaction);
      for (const { docId, txId } of links) {
        await docTx.update(
          { id: docId },
          { matchedTransactionId: txId, matchStatus: 'matched' },
        );
        await slimTx.update({ id: txId }, { matchedDocumentId: docId });
      }
    });

    console.log(
      `[matcher] DONE paired ${links.length} doc↔tx (${docs.length} docs / ${candidates.length} txs considered) | ${tag}`,
    );
    return {
      paired: links.length,
      docsConsidered: docs.length,
      txsConsidered: candidates.length,
    };
  }

  /**
   * Manual pair from the review modal — the user clicked "link to
   * existing doc" on a tx_only row. Symmetric writeback like the auto
   * matcher, but `match_status` is stamped "manual_link" so we can later
   * distinguish hand-confirmed pairs from algorithmic ones (useful for
   * tuning the auto thresholds).
   *
   * Caller is responsible for verifying both rows belong to the same user
   * and business; we just re-check ownership defensively before writing.
   */
  async linkDocToTx(
    firebaseId: string,
    businessNumber: string,
    documentId: number,
    slimTransactionId: number,
  ): Promise<void> {
    const doc = await this.docRepo.findOne({ where: { id: documentId } });
    const slim = await this.slimRepo.findOne({ where: { id: slimTransactionId } });
    if (!doc || !slim) {
      throw new Error(`linkDocToTx: doc=${documentId} or tx=${slimTransactionId} not found`);
    }
    if (doc.businessNumber !== businessNumber || slim.businessNumber !== businessNumber) {
      throw new Error(`linkDocToTx: doc/tx don't belong to business ${businessNumber}`);
    }
    if (doc.matchedTransactionId && doc.matchedTransactionId !== slimTransactionId) {
      throw new Error(`linkDocToTx: doc ${documentId} is already linked to tx ${doc.matchedTransactionId}`);
    }
    if (slim.matchedDocumentId && slim.matchedDocumentId !== documentId) {
      throw new Error(`linkDocToTx: tx ${slimTransactionId} is already linked to doc ${slim.matchedDocumentId}`);
    }

    await this.dataSource.transaction(async manager => {
      await manager.getRepository(ExtractedDocument).update(
        { id: documentId },
        { matchedTransactionId: slimTransactionId, matchStatus: 'manual_link' },
      );
      await manager.getRepository(SlimTransaction).update(
        { id: slimTransactionId },
        { matchedDocumentId: documentId },
      );
    });
    console.log(
      `MatchingService: manual link doc=${documentId} ↔ tx=${slimTransactionId} (biz=${businessNumber})`,
    );
  }

  /** Whole-day difference, ignoring time-of-day. Both inputs are stored as
   *  DATE columns in MySQL so the time component is 00:00 UTC already, but
   *  we round defensively in case anyone passes a Date constructed from a
   *  full timestamp. */
  private daysBetween(a: Date, b: Date): number {
    const ms = a.getTime() - b.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
  }
}
