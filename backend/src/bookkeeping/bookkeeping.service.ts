import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JournalEntry } from './jouranl-entry.entity';
import { JournalLine } from './jouranl-line.entity';
import { BookingAccount } from './account.entity';
import { SharedService } from '../shared/shared.service';
import { JournalEntryInput, JournalLineInput } from './dto/journal-entry-input.interface';
import { CreateManualJournalEntryDto } from './dto/manual-journal-entry.dto';
import { JournalReferenceType } from '../enum';
import { EntityManager } from 'typeorm';
import { Business } from '../business/business.entity';


@Injectable()
export class BookkeepingService {

  constructor(
    private readonly sharedService: SharedService,
    private readonly dataSource: DataSource,
    @InjectRepository(JournalEntry)
    private journalEntryRepo: Repository<JournalEntry>,
    @InjectRepository(JournalLine)
    private journalLineRepo: Repository<JournalLine>,
    @InjectRepository(BookingAccount)
    private defaultBookingAccountRepo: Repository<BookingAccount>,
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
  ) { }


  /**
   * Create a journal entry + its lines. Atomic and collision-free:
   *  - The PK (`journal_entry.id`) is left to MySQL auto-increment, so entries
   *    are globally unique — two businesses can never overwrite each other.
   *  - A per-business human-readable running number is stored in `entryNumber`
   *    (sourced from the per-business counter), incremented only on success.
   *  - The whole operation runs in ONE transaction: if the caller already has
   *    one (passes `manager`), we join it; otherwise we open our own. A missing
   *    account (or any failure) rolls back the header, lines, AND the counter
   *    increment — no orphan headers, no stuck counters.
   * Returns the entryNumber and global PK id of the created entry.
   */
  async createJournalEntry(input: JournalEntryInput, manager?: EntityManager): Promise<{ entryNumber: number; id: number }> {
    try {
      if (manager) {
        return await this.persistJournalEntry(input, manager);
      } else {
        return await this.dataSource.transaction((m) => this.persistJournalEntry(input, m));
      }
    } catch (err) {
      console.error('❌ Failed to create journal entry:', {
        issuerBusinessNumber: input.issuerBusinessNumber,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        error: err?.message,
      });
      throw err; // preserve the original cause; caller decides how to handle
    }
  }

  /** Core persistence — always runs inside the given transactional manager. */
  private async persistJournalEntry(
    input: JournalEntryInput,
    m: EntityManager,
  ): Promise<{ entryNumber: number; id: number }> {
    const {
      firebaseId,
      issuerBusinessNumber,
      subCategory,
      counterAccountCode,
      counterPartyName,
      documentTotal,
      date,
      valueDate,
      vatDate,
      notes,
      vatReportingPeriod,
      referenceType,
      referenceId,
      description,
      lines,
    } = input;

    const journalEntryRepo = m.getRepository(JournalEntry);
    const journalLineRepo = m.getRepository(JournalLine);
    const bookingAccountRepo = m.getRepository(BookingAccount);

    // 1. Resolve every account FIRST so a missing code aborts before any write.
    const resolvedLines = await Promise.all(
      lines.map(async (line, index) => {
        const account = await bookingAccountRepo.findOneByOrFail({
          code: line.accountCode,
        });
        return {
          firebaseId,
          issuerBusinessNumber,
          accountCode: account.code,
          lineInEntry: index + 1,
          debit: line.debit || 0,
          credit: line.credit || 0,
          amountBeforeVat: line.amountBeforeVat || 0,
          vatAmount: line.vatAmount || 0,
          isEquipment: line.isEquipment ?? false,
          taxPercent: line.taxPercent ?? 100,
          vatPercent: line.vatPercent ?? 100,
          amountForTax: line.amountForTax ?? 0,
          subCategoryName: line.subCategoryName ?? null,
        };
      }),
    );

    // 2. Per-business running number for display (NOT the PK).
    const entryNumber = await this.sharedService.getJournalEntryCurrentIndex(
      issuerBusinessNumber,
      m,
    );

    // 3. Save header — NO explicit id; MySQL auto-increment assigns the PK.
    const journalEntry = await journalEntryRepo.save(
      journalEntryRepo.create({
        entryNumber,
        firebaseId,
        issuerBusinessNumber,
        subCategory: subCategory ?? null,
        counterAccountCode: counterAccountCode ?? null,
        counterPartyName: counterPartyName ?? null,
        documentTotal: documentTotal ?? null,
        date,
        valueDate: valueDate ?? null,
        vatDate: vatDate ?? null,
        notes: notes ?? null,
        vatReportingPeriod: vatReportingPeriod ?? null,
        referenceType,
        referenceId,
        description: description || '',
      }),
    );

    // 4. Save lines, linked to the auto-generated PK.
    await journalLineRepo.save(
      resolvedLines.map((l) =>
        journalLineRepo.create({ ...l, journalEntryId: journalEntry.id }),
      ),
    );

    // 5. Advance the per-business running number — only after a successful post.
    await this.sharedService.incrementJournalEntryIndex(issuerBusinessNumber, m);

    return { entryNumber, id: journalEntry.id };
  }

  /**
   * Build and post a manual journal entry with a REAL VAT line when
   * applicable, plus an automatic bank (1100) counter line — same overall
   * shape as buildExpenseJournalLines/buildDocumentJournalLines, so a manual
   * entry moves the bank balance exactly like a normal expense/income
   * posting does. `amount` is the GROSS total (matches Expense.sum's
   * convention); net/vatAmount are derived from it using the effective VAT
   * rate: net = total / (1 + vatRate × (vatPercent / 100)); vatAmount = total − net.
   * Each dto line becomes 1 or 2 JournalLineInput rows:
   *   - line 1: the P&L account, net of VAT (matches every other P&L line —
   *     VAT is never mixed into it). income/income_exempt always post to
   *     '4000' — the service ignores/overrides whatever accountCode the
   *     client sent, never trusting it for those kinds.
   *   - line 2 (only when vatAmount > 0): the technical VAT account — '2400'
   *     for income, '2410' for expense — added automatically, never chosen
   *     by the user.
   * After all dto lines are processed, ONE bank line (account '1100') is
   * added for the entry's full gross total — debited for income/income_exempt,
   * credited for expense — always assuming immediate bank settlement (no
   * deferred A/R (1200) support here, unlike the document-issuing flow).
   * vatPercent is fixed 100 for income, fixed 0 for income_exempt, and
   * user-entered (default 100) for expense. taxPercent (income-tax
   * recognition %) is fixed 100 for income/income_exempt, user-entered
   * (default 100) for expense — feeds amountForTax = net × taxPercent / 100.
   * The VAT rate itself always comes from the existing single source of
   * truth (SharedService.getVatRateByYear / VAT_RATES in enum.ts), never a
   * hardcoded literal.
   */
  async createManualJournalEntry(
    dto: CreateManualJournalEntryDto,
    firebaseId: string,
    issuerBusinessNumber: string,
    manager?: EntityManager,
  ): Promise<{ entryNumber: number; id: number }> {
    const isExpense = dto.entryKind === 'expense';
    const isExempt = dto.entryKind === 'income_exempt';
    const expectedType = isExpense ? 'expense' : 'income';
    const vatAccountCode = isExpense ? '2410' : '2400';

    if (!dto.lines?.length) {
      throw new BadRequestException('At least one line is required');
    }

    const vatRate = this.sharedService.getVatRateByYear(new Date(dto.date));
    const bookingAccountRepo = manager ? manager.getRepository(BookingAccount) : this.defaultBookingAccountRepo;

    const lines: JournalLineInput[] = [];
    let anyVatLine = false;

    for (const line of dto.lines) {
      const total = Number(line.amount) || 0;
      if (total === 0) continue;

      // income/income_exempt always post to the fixed income account — never
      // trust a client-supplied accountCode for those kinds.
      const accountCode = isExpense ? line.accountCode : '4000';
      if (isExpense && !accountCode) continue;

      // Safety net: the manual-entry dropdown is meant to only offer
      // postable P&L accounts, but nothing stops a client from sending an
      // arbitrary code directly — reject anything that isn't a real,
      // kind-matching posting account (blocks silently posting into
      // technical/asset/liability accounts via this path).
      const account = await bookingAccountRepo.findOneByOrFail({ code: accountCode });
      if (!account.pnlCategory || account.type !== expectedType) {
        throw new BadRequestException(
          `Account ${accountCode} is not a valid ${expectedType} posting account`,
        );
      }

      // vatPercent: fixed 100 for income, fixed 0 for income_exempt (no VAT
      // at all), user-entered (default 100) for expense.
      const vatPercent = isExempt ? 0 : isExpense ? Number(line.vatPercent ?? 100) : 100;
      // taxPercent: fixed 100 for income/income_exempt, user-entered
      // (default 100) for expense.
      const taxPercent = isExpense ? Number(line.taxPercent ?? 100) : 100;

      // total is GROSS — derive net/vatAmount from it (same math the Expense
      // entity itself uses, expenses.service.ts:135).
      const net = Number((total / (1 + vatRate * (vatPercent / 100))).toFixed(2));
      const vatAmount = Number((total - net).toFixed(2));
      const amountForTax = Number((net * taxPercent / 100).toFixed(2));
      const isEquipment = isExpense ? !!line.isEquipment : false;

      // Line 1: the P&L account itself, always net of VAT.
      lines.push({
        accountCode,
        debit: isExpense ? net : 0,
        credit: isExpense ? 0 : net,
        amountBeforeVat: net,
        vatAmount: 0,
        isEquipment,
        taxPercent,
        vatPercent,
        amountForTax,
        subCategoryName: isExpense ? (line.subCategoryName?.trim() || null) : null,
      });

      // Line 2: the real VAT line — added automatically, never user-chosen.
      if (vatAmount > 0) {
        anyVatLine = true;
        lines.push({
          accountCode: vatAccountCode,
          debit: isExpense ? vatAmount : 0,
          credit: isExpense ? 0 : vatAmount,
          amountBeforeVat: 0,
          vatAmount,
          isEquipment,
          taxPercent: 0,
          vatPercent,
          amountForTax: 0,
          subCategoryName: null,
        });
      }
    }

    if (!lines.length) {
      throw new BadRequestException('At least one line with a non-zero amount is required');
    }

    // Sums the P&L line(s) and (when present) their VAT line(s) — the true
    // gross total, computed BEFORE the bank counter line below (which would
    // otherwise double it, since that line's amount lands on the opposite
    // debit/credit side).
    const documentTotal = lines.reduce((sum, l) => sum + (l.debit || l.credit || 0), 0);

    // Bank counter line — balances the entry against account 1100 (Bank)
    // automatically, the same way buildExpenseJournalLines/
    // buildDocumentJournalLines always add a cash/bank counter line. Without
    // this, a manual entry only ever posted the P&L + VAT side and never
    // moved the bank balance.
    lines.push({
      accountCode: '1100',
      debit: isExpense ? 0 : documentTotal,
      credit: isExpense ? documentTotal : 0,
      amountBeforeVat: 0,
      vatAmount: 0,
      isEquipment: false,
      taxPercent: 0,
      vatPercent: 0,
      amountForTax: 0,
      subCategoryName: null,
    });

    const vatReportingPeriod = isExempt ? null : (dto.vatReportingPeriod?.trim() || null);
    if (!isExempt && anyVatLine && !vatReportingPeriod) {
      throw new BadRequestException('vatReportingPeriod is required for this entry');
    }

    const input: JournalEntryInput = {
      firebaseId,
      issuerBusinessNumber,
      subCategory: null,
      counterAccountCode: '1100',
      counterPartyName: null,
      documentTotal,
      date: dto.date,
      valueDate: dto.valueDate || dto.date,
      vatDate: dto.vatDate || dto.date,
      notes: dto.notes ?? undefined,
      vatReportingPeriod,
      referenceType: JournalReferenceType.MANUAL,
      referenceId: null,
      description: dto.reference?.trim() || '',
      lines,
    };

    return this.createJournalEntry(input, manager);
  }

  /**
   * Post multiple manual journal entries atomically — all succeed or none do.
   * Used by the list-of-entries UI: if any entry fails validation (bad
   * account, missing vatReportingPeriod, etc.), the whole transaction rolls
   * back, so a failing third entry can never leave the first two committed.
   */
  async createManualJournalEntries(
    dtos: CreateManualJournalEntryDto[],
    firebaseId: string,
    issuerBusinessNumber: string,
  ): Promise<{ entryNumber: number; id: number }[]> {
    if (!dtos?.length) {
      throw new BadRequestException('At least one entry is required');
    }
    return this.dataSource.transaction(async (manager) => {
      const results: { entryNumber: number; id: number }[] = [];
      for (const dto of dtos) {
        results.push(await this.createManualJournalEntry(dto, firebaseId, issuerBusinessNumber, manager));
      }
      return results;
    });
  }

  /**
   * Valid vatReportingPeriod labels for a business's manual-entry dropdown —
   * 2 months ahead through 12 months back, using the same cadence logic
   * (buildReportPeriodLabel) as every other VAT-period stamp in the system,
   * so this list never drifts from what the VAT/P&L reports actually bucket by.
   */
  async getVatReportingPeriods(businessNumber: string, firebaseId: string): Promise<string[]> {
    const business = await this.businessRepo.findOne({ where: { businessNumber, firebaseId } });
    if (!business) {
      throw new BadRequestException('Business not found');
    }
    const labels: string[] = [];
    const seen = new Set<string>();
    const today = new Date();
    for (let m = 2; m >= -12; m--) {
      const cursor = new Date(today.getFullYear(), today.getMonth() + m, 1);
      const label = this.sharedService.buildReportPeriodLabel(business.businessType, business.vatReportingType, cursor);
      if (!seen.has(label)) {
        seen.add(label);
        labels.push(label);
      }
    }
    return labels;
  }

  /**
   * Replace the LINES of an existing journal entry, keeping its header (id,
   * entryNumber, date, references) untouched. Used to correct a posting when
   * its source row is re-classified — e.g. an expense's category changed, so a
   * different bookkeeping account (accountCode) now applies.
   *
   * The entry is located by (referenceType, referenceId, issuerBusinessNumber).
   * Returns true when a matching entry was found and its lines replaced; false
   * when no entry exists yet (the caller then creates a fresh one — this method
   * never creates a header). Every account is resolved BEFORE any delete, so a
   * missing code aborts without losing the old lines. Atomic: the delete +
   * re-insert run in one transaction (the caller's, when `manager` is passed,
   * otherwise a fresh one).
   */
  async replaceJournalEntryLines(
    referenceType: JournalReferenceType,
    referenceId: number,
    issuerBusinessNumber: string,
    lines: JournalLineInput[],
    manager?: EntityManager,
  ): Promise<boolean> {
    const run = async (m: EntityManager): Promise<boolean> => {
      const journalEntryRepo = m.getRepository(JournalEntry);
      const journalLineRepo = m.getRepository(JournalLine);
      const bookingAccountRepo = m.getRepository(BookingAccount);

      const entry = await journalEntryRepo.findOne({
        where: { referenceType, referenceId, issuerBusinessNumber },
      });
      if (!entry) return false;

      // Resolve all accounts FIRST so a missing code aborts before deletion.
      const resolvedLines = await Promise.all(
        lines.map(async (line, index) => {
          const account = await bookingAccountRepo.findOneByOrFail({
            code: line.accountCode,
          });
          return {
            firebaseId: entry.firebaseId,
            issuerBusinessNumber,
            journalEntryId: entry.id,
            accountCode: account.code,
            lineInEntry: index + 1,
            debit: line.debit || 0,
            credit: line.credit || 0,
            amountBeforeVat: line.amountBeforeVat || 0,
            vatAmount: line.vatAmount || 0,
            isEquipment: line.isEquipment ?? false,
            subCategoryName: line.subCategoryName ?? null,
          };
        }),
      );

      // Swap the lines, keep the header.
      await journalLineRepo.delete({ journalEntryId: entry.id });
      await journalLineRepo.save(
        resolvedLines.map((l) => journalLineRepo.create(l)),
      );
      return true;
    };

    try {
      if (manager) return await run(manager);
      return await this.dataSource.transaction(run);
    } catch (err) {
      console.error('❌ Failed to replace journal entry lines:', {
        issuerBusinessNumber,
        referenceType,
        referenceId,
        error: err?.message,
      });
      throw err; // preserve cause; caller decides how to handle
    }
  }

  /**
   * Look up the entryNumber for an existing journal entry by its source
   * reference (referenceType + referenceId + businessNumber). Used by the
   * backward-compatibility path in syncExpenseJournalEntry to retrieve the
   * entryNumber for expenses that existed before journalEntryNumber was added
   * to the Expense table.
   * Returns null when no matching entry exists.
   */
  async findJournalEntryNumber(
    referenceType: JournalReferenceType,
    referenceId: number,
    issuerBusinessNumber: string,
  ): Promise<number | null> {
    const entry = await this.journalEntryRepo.findOne({
      where: { referenceType, referenceId, issuerBusinessNumber },
      select: { entryNumber: true },
    });
    return entry?.entryNumber ?? null;
  }

  /**
   * Update the header AND lines of an existing journal entry, located by
   * entryNumber + issuerBusinessNumber. Used when an expense is edited so the
   * ledger reflects the new amounts, dates, accounts, and supplier name.
   *
   * All mutable header fields are overwritten (date, valueDate, vatDate,
   * description, counterPartyName, documentTotal, vatReportingPeriod,
   * subCategory, referenceId, notes). The entryNumber and the global PK (id)
   * are never changed. Lines are replaced atomically (delete + re-insert).
   * Returns true when the entry was found and updated; false when not found
   * (caller should then create a new entry).
   */
  async updateJournalEntryFull(
    entryNumber: number,
    issuerBusinessNumber: string,
    input: JournalEntryInput,
    manager?: EntityManager,
  ): Promise<boolean> {
    const run = async (m: EntityManager): Promise<boolean> => {
      const journalEntryRepo = m.getRepository(JournalEntry);
      const journalLineRepo = m.getRepository(JournalLine);
      const bookingAccountRepo = m.getRepository(BookingAccount);

      const entry = await journalEntryRepo.findOne({
        where: { entryNumber, issuerBusinessNumber },
      });
      if (!entry) return false;

      // Resolve all accounts BEFORE any mutation so a bad code aborts cleanly.
      const resolvedLines = await Promise.all(
        input.lines.map(async (line, index) => {
          const account = await bookingAccountRepo.findOneByOrFail({ code: line.accountCode });
          return {
            firebaseId: entry.firebaseId,
            issuerBusinessNumber,
            journalEntryId: entry.id,
            accountCode: account.code,
            lineInEntry: index + 1,
            debit: line.debit || 0,
            credit: line.credit || 0,
            amountBeforeVat: line.amountBeforeVat || 0,
            vatAmount: line.vatAmount || 0,
            isEquipment: line.isEquipment ?? false,
            taxPercent: line.taxPercent ?? 100,
            vatPercent: line.vatPercent ?? 100,
            amountForTax: line.amountForTax ?? 0,
            subCategoryName: line.subCategoryName ?? null,
          };
        }),
      );

      // Update mutable header fields.
      await journalEntryRepo.update(entry.id, {
        date: input.date,
        valueDate: input.valueDate ?? null,
        vatDate: input.vatDate ?? null,
        description: input.description ?? entry.description,
        counterPartyName: input.counterPartyName ?? null,
        documentTotal: input.documentTotal ?? null,
        vatReportingPeriod: input.vatReportingPeriod ?? null,
        subCategory: input.subCategory ?? null,
        referenceId: input.referenceId ?? entry.referenceId,
        notes: input.notes ?? null,
      });

      // Swap lines.
      await journalLineRepo.delete({ journalEntryId: entry.id });
      await journalLineRepo.save(resolvedLines.map((l) => journalLineRepo.create(l)));

      return true;
    };

    try {
      if (manager) return await run(manager);
      return await this.dataSource.transaction(run);
    } catch (err) {
      console.error('❌ Failed to update journal entry full:', {
        entryNumber,
        issuerBusinessNumber,
        error: err?.message,
      });
      throw err;
    }
  }

}