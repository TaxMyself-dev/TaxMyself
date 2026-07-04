import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { JournalEntry } from './jouranl-entry.entity';
import { JournalLine } from './jouranl-line.entity';
import { DefaultBookingAccount } from './account.entity';
import { SharedService } from '../shared/shared.service';
import { JournalEntryInput, JournalLineInput } from './dto/journal-entry-input.interface';
import { JournalReferenceType } from '../enum';
import { EntityManager } from 'typeorm';


@Injectable()
export class BookkeepingService {

  constructor(
    private readonly sharedService: SharedService,
    private readonly dataSource: DataSource,
    @InjectRepository(JournalEntry)
    private journalEntryRepo: Repository<JournalEntry>,
    @InjectRepository(JournalLine)
    private journalLineRepo: Repository<JournalLine>,
    @InjectRepository(DefaultBookingAccount)
    private defaultBookingAccountRepo: Repository<DefaultBookingAccount>,
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
    const bookingAccountRepo = m.getRepository(DefaultBookingAccount);

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
      const bookingAccountRepo = m.getRepository(DefaultBookingAccount);

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
      const bookingAccountRepo = m.getRepository(DefaultBookingAccount);

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