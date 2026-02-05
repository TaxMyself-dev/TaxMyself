import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JournalEntry } from './jouranl-entry.entity';
import { JournalLine } from './jouranl-line.entity';
import { DefaultBookingAccount } from './account.entity';
import { SharedService } from '../shared/shared.service';
import { JournalEntryInput } from './dto/journal-entry-input.interface';
import { EntityManager } from 'typeorm';


@Injectable()
export class BookkeepingService {

  constructor(
    private readonly sharedService: SharedService,
    @InjectRepository(JournalEntry)
    private journalEntryRepo: Repository<JournalEntry>,
    @InjectRepository(JournalLine)
    private journalLineRepo: Repository<JournalLine>,
    @InjectRepository(DefaultBookingAccount)
    private defaultBookingAccountRepo: Repository<DefaultBookingAccount>,
  ) { }


  async createJournalEntry(input: JournalEntryInput, manager?: EntityManager): Promise<void> {
  
  const {
    issuerBusinessNumber,
    date,
    referenceType,
    referenceId,
    description,
    lines,
  } = input;

  try {
    // Use transactional-aware repositories
    const journalEntryRepo = manager
      ? manager.getRepository(JournalEntry)
      : this.journalEntryRepo;

    const journalLineRepo = manager
      ? manager.getRepository(JournalLine)
      : this.journalLineRepo;

    const bookingAccountRepo = manager
      ? manager.getRepository(DefaultBookingAccount)
      : this.defaultBookingAccountRepo;

    // 1. Get journal entry index
    const entryId = await this.sharedService.getJournalEntryCurrentIndex(issuerBusinessNumber, manager);    

    // 2. Save journal entry
    const journalEntry = await journalEntryRepo.save({
      id: entryId,
      issuerBusinessNumber,
      date,
      referenceType,
      referenceId,
      description: description || '',
    });

    // 3. Prepare lines
    const journalLines = await Promise.all(
      lines.map(async (line, index) => {
        const account = await bookingAccountRepo.findOneByOrFail({
          code: line.accountCode,
        });

        return {
          journalEntryId: journalEntry.id,
          issuerBusinessNumber,
          accountCode: account.code,
          lineInEntry: index + 1,
          debit: line.debit || 0,
          credit: line.credit || 0,
        };
      }),
    );

    // 4. Save lines
    await journalLineRepo.save(journalLines);

    // 5. Increment journal index
    await this.sharedService.incrementJournalEntryIndex(issuerBusinessNumber, manager); // ✅ must support manager

  } catch (err) {
    console.error('❌ Fatal error while creating journal entry:', {
      issuerBusinessNumber,
      referenceType,
      referenceId,
      error: err?.message,
    });

    throw new InternalServerErrorException(
      `Fatal: Failed to create journal entry for user ${issuerBusinessNumber}. Details: ${err?.message || err}`
    );
  }
}






}