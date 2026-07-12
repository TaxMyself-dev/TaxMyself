import { Injectable, BadRequestException, NotFoundException, HttpException, HttpStatus, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, Not, Brackets, LessThan, MoreThan, FindOptionsWhere, MoreThanOrEqual, LessThanOrEqual } from 'typeorm';
import * as XLSX from 'xlsx';
import { Express } from 'express';
import { SourceType, VATReportingType, BusinessType, ExpenseReportScope } from 'src/enum';

//Entities
// TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: import kept while legacy flows (file upload, Finsite ingest, classifyTransaction, quickClassify, report reads) still write/read the transactions table.
import { Transactions } from './transactions.entity';
import { Bill } from './bill.entity';
import { Source } from './source.entity';
import { ClassifiedTransactions } from './classified-transactions.entity';
import { Expense } from '../expenses/expenses.entity';
import { Finsite } from 'src/finsite/finsite.entity';
import { FullTransactionCache } from './full-transaction-cache.entity';
import { SlimTransaction } from './slim-transaction.entity';
import { UserSourceSyncState } from './user-source-sync-state.entity';

//Services
import { SharedService } from '../shared/shared.service';
import { ExpensesService } from '../expenses/expenses.service';
import { FinsiteService } from 'src/finsite/finsite.service';
import { CatalogService } from 'src/bookkeeping/catalog.service';

//DTOs
import { UpdateTransactionsDto } from './dtos/update-transactions.dto';
import { User } from 'src/users/user.entity';
import { CreateBillDto } from './dtos/create-bill.dto';
import * as fs from 'fs';
import { Business } from 'src/business/business.entity';
import { log } from 'console';


@Injectable()
export class TransactionsService {
  constructor(
    private readonly sharedService: SharedService,
    private readonly expenseService: ExpensesService,
    private readonly finsiteService: FinsiteService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: repo injection required by all remaining legacy flows. Remove together with those methods.
    @InjectRepository(Transactions)
    private transactionsRepo: Repository<Transactions>,
    @InjectRepository(Finsite)
    private finsiteRepo: Repository<Finsite>,
    @InjectRepository(ClassifiedTransactions)
    private classifiedTransactionsRepo: Repository<ClassifiedTransactions>,
    @InjectRepository(Bill)
    private billRepo: Repository<Bill>,
    @InjectRepository(Source)
    private sourceRepo: Repository<Source>,
    @InjectRepository(Expense)
    private expenseRepo: Repository<Expense>,
    // Phase 4.6: category names for the legacy transactions-table filter come
    // from the NEW catalog (the old default_/user_category reads are gone).
    private readonly catalogService: CatalogService,
    @InjectRepository(FullTransactionCache)
    private cacheRepo: Repository<FullTransactionCache>,
    @InjectRepository(SlimTransaction)
    private slimRepo: Repository<SlimTransaction>,
    @InjectRepository(UserSourceSyncState)
    private userSourceSyncStateRepo: Repository<UserSourceSyncState>,
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
  ) { }


  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: active Finsite ingest that writes directly to the legacy transactions table.
  // Replace with a pipeline that writes to full_transactions_cache instead, then remove this method.
  async getTransactionsFromFinsite(
    startDate: string,
    endDate: string,
    companyId?: string // Optional company ID
  ): Promise<{ companyName: string; transactions: { name: string; date: string; sum: number }[] }[]> {

    console.log("getTransactionsFromFinsite - start");

    const sessionId = await this.finsiteService.getFinsiteToken(
      process.env.FINSITE_ID,
      process.env.FINSITE_KEY
    );

    // Step 1: Load Finsite data from the database
    const query = companyId
      ? { finsiteId: companyId }
      : {}; // Filter by companyId if provided

    const finsiteData = await this.finsiteRepo.find({
      where: query,
    });

    console.log("Finsite data loaded:", finsiteData);

    // Step 2: Group Finsite data by company
    const companiesData: Record<string, any> = {};

    finsiteData.forEach(record => {
      if (!companiesData[record.finsiteId]) {
        companiesData[record.finsiteId] = {
          id: record.finsiteId,
          name: record.companyName,
          paymentMethods: [],
          transactions: [], // Collect transactions for debug
        };
      }
      companiesData[record.finsiteId].paymentMethods.push(record);
    });

    const filteredCompanies = Object.values(companiesData);

    console.log("Filtered companies:", filteredCompanies);

    for (const company of filteredCompanies) {
      console.log("###### company is ", company.name);

      // Step 3: Fetch Firebase ID for the company
      const user = await this.userRepo.findOne({
        where: { finsiteId: company.id },
      });

      if (!user) {
        console.warn(`User with finsiteId ${company.id} not found. Skipping.`);
        continue;
      }

      const firebaseId = user.firebaseId;
      console.log("###### firebaseId is ", firebaseId);

      // Step 4: Iterate over payment methods
      for (const method of company.paymentMethods) {
        if (method.paymentMethodType === SourceType.CREDIT_CARD || method.paymentMethodType === SourceType.BANK_ACCOUNT) {
          console.log("###### method is ", method.paymentId);
          try {
            // Step 5: Fetch transactions for the payment method
            const transactions = await this.finsiteService.getTransactionsById(
              sessionId,
              method.getTransFid,
              startDate,
              endDate
            );

            const balances = await this.finsiteService.getBalances(
              sessionId,
              method.getTransFid,
              startDate,
            );

            // Step 6: Save transactions to the database
            for (const transaction of transactions) {

              const existingTransaction = await this.transactionsRepo.findOne({
                where: { finsiteId: transaction.EntryID }, // Adjust field name if different
              });

              if ((!existingTransaction) && !((transaction.Notes1 == 'חיוב כרטיס בעו"ש') && (transaction.Credit))) {

                const billName = await this.getBillNameBySourceName(firebaseId, method.paymentId);
                const businessNumber = await this.getBusinessNumberByBillName(firebaseId, billName);
                const billId = await this.getBillIdByBillName(firebaseId, billName);

                const txSum = transaction.Debit ? -transaction.Debit : transaction.Credit;

                const classifiedTransactionRaw = billId
                  ? await this.classifiedTransactionsRepo.findOne({
                      where: {
                        userId: firebaseId,
                        transactionName: transaction.Notes1,
                        billId,
                      },
                    })
                  : null;

                const classifiedTransaction =
                  classifiedTransactionRaw && this.ruleMatchesSum(classifiedTransactionRaw, txSum)
                    ? classifiedTransactionRaw
                    : null;

                const newTransaction: Partial<Transactions> = {
                  userId: firebaseId,
                  finsiteId: transaction.EntryID,
                  paymentIdentifier: method.paymentId,
                  billName: billName,
                  businessNumber: businessNumber,
                  name: transaction.Notes1,
                  note2: transaction.Notes2,
                  billDate: transaction.Date,
                  payDate: null,
                  sum: txSum,
                };

                // Merge fields if classifiedTransaction exists
                if (classifiedTransaction) {
                  newTransaction.category = classifiedTransaction.category;
                  newTransaction.subCategory = classifiedTransaction.subCategory;
                  newTransaction.isRecognized = classifiedTransaction.isRecognized;
                  newTransaction.vatPercent = classifiedTransaction.vatPercent;
                  newTransaction.taxPercent = classifiedTransaction.taxPercent;
                  newTransaction.isEquipment = classifiedTransaction.isEquipment;
                  newTransaction.reductionPercent = classifiedTransaction.reductionPercent;
                }

                await this.transactionsRepo.save(newTransaction);

                // Add to the company's transactions summary
                company.transactions.push({
                  name: newTransaction.name,
                  date: newTransaction.billDate,
                  sum: newTransaction.sum,
                });

              } else {
                console.log(`Transaction with EntryID ${transaction.EntryID} already exists. Skipping.`);
              }
            }
            console.log("###### transactions from method save done", method.paymentId);

          } catch (error) {
            console.error(
              `Failed to fetch/save transactions for PaymentMethod ID: ${method.getTransFId}`,
              error
            );
          }
        }
      }
    }

    // Format and return the transactions summary
    const result = filteredCompanies.map(company => ({
      companyName: company.name,
      transactions: company.transactions,
    }));

    console.log("All transactions processed and saved.");

    return result; // Return the summarized result

  }


  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: file-upload ingestion flow that writes parsed Excel rows to the legacy transactions table.
  // Replace with a flow that writes to full_transactions_cache, then remove this method.
  async saveTransactions(file: Express.Multer.File, userId: string): Promise<{ message: string }> {

    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const rows: any[][] = XLSX.utils
      .sheet_to_json(worksheet, { header: 1, raw: false }) as any[][];

    // Filter out rows that are entirely empty
    const filteredRows = rows.filter(row => row.some(cell => cell !== null && cell !== undefined && cell !== ""));

    // Assuming the first row contains headers
    const headers = filteredRows.shift();

    const skipConditions = [
      (row: any[]) => row[headers.findIndex(h => h === 'הערות 1')] === 'חיוב כרטיס בעו"ש'      // Add more conditions here as needed
    ];

    // Find index of each column based on header row
    //billDate = תאריך עסקה כלומר היום בו קניתי את המוצר. payDate = תאריך תשלום כלומר היום בו בפועל ירד לי כסף מהחשבון
    const nameIndex = headers.findIndex(header => header === 'הערות 1'); // שם העסק
    const paymentIdentifierIndex = headers.findIndex(header => header === 'קוד חשבון הנהח"ש'); // אמצעי זיהוי החשבון
    const billDateIndex = headers.findIndex(header => header === 'תאריך');
    //const payDateIndex = headers.findIndex(header => header === 'תאריך התשלום');
    // Find the index of the sum, חובה, and זכות columns
    const sumIndex = headers.findIndex(header => header === 'סכום');
    const debitIndex = headers.findIndex(header => header === 'חובה');
    const creditIndex = headers.findIndex(header => header === 'זכות');

    const classifiedTransactions = await this.classifiedTransactionsRepo.find({ where: { userId } });

    // Fetch user's bills and create mappings from paymentIdentifier to billName and billId
    const userBills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
    const paymentIdentifierToBillName = new Map<string, string>();
    const paymentIdentifierToBillId = new Map<string, number>();

    userBills.forEach(bill => {
      bill.sources.forEach(source => {
        paymentIdentifierToBillName.set(source.sourceName, bill.billName);
        paymentIdentifierToBillId.set(source.sourceName, bill.id);
      });
    });

    const transactionsToSave: Transactions[] = [];
    let skippedTransactions = 0;

    for (const row of filteredRows) {

      // Check if any skip condition is met
      if (skipConditions.some(condition => condition(row))) {
        skippedTransactions++;
        continue;
      }

      const transaction = new Transactions();
      transaction.name = row[nameIndex];
      transaction.paymentIdentifier = row[paymentIdentifierIndex];

      try {
        transaction.billDate = this.sharedService.convertStringToDateObject(row[billDateIndex]);
      } catch (error) {
        console.error(`Failed to parse date for row: ${row}, error: ${error.message}`);
        throw new BadRequestException(`Invalid date format in the file: ${error.message}`);
      }

      // Determine the sum based on which columns are available, handling commas in numbers
      if (sumIndex !== -1) {
        transaction.sum = parseFloat(row[sumIndex].toString().replace(/,/g, ''));
      } else if (debitIndex !== -1 && creditIndex !== -1) {
        const debit = parseFloat(row[debitIndex]?.toString().replace(/,/g, '') || '0');
        const credit = parseFloat(row[creditIndex]?.toString().replace(/,/g, '') || '0');
        transaction.sum = debit > 0 ? -debit : credit;
      } else {
        throw new BadRequestException("The file must contain either 'סכום' or both 'חובה' and 'זכות' columns.");
      }

      transaction.userId = userId;

      // Check if a transaction with the same name, paymentIdentifier, billDate, sum, and userId already exists
      const existingTransaction = await this.transactionsRepo.findOne({
        where: {
          name: transaction.name,
          paymentIdentifier: transaction.paymentIdentifier,
          billDate: transaction.billDate,
          sum: transaction.sum,
          userId: transaction.userId,
        },
      });

      if (existingTransaction) {
        // console.log(`Transaction with name ${transaction.name}, paymentIdentifier ${transaction.paymentIdentifier}, billDate ${transaction.billDate}, and sum ${transaction.sum} already exists. Skipping.`);
        skippedTransactions++;
        continue;
      }

      // Set the billName if paymentIdentifier is associated with a bill
      const billName = paymentIdentifierToBillName.get(transaction.paymentIdentifier);
      if (billName) {
        transaction.billName = billName;
        transaction.businessNumber = await this.getBusinessNumberByBillName(transaction.userId, billName);
      }

      // Check if there's a matching classified transaction
      const billId = paymentIdentifierToBillId?.get(transaction.paymentIdentifier);
      const matchingClassifiedTransaction = classifiedTransactions.find(
        ct => ct.transactionName === transaction.name && ct.billId === billId && this.ruleMatchesSum(ct, transaction.sum),
      );
      // If a match is found, update the transaction fields with the classified values
      if (matchingClassifiedTransaction) {
        console.log("matchingClassifiedTransaction is ", matchingClassifiedTransaction);

        transaction.category = matchingClassifiedTransaction.category;
        transaction.subCategory = matchingClassifiedTransaction.subCategory;
        transaction.isRecognized = matchingClassifiedTransaction.isRecognized;
        transaction.vatPercent = matchingClassifiedTransaction.vatPercent;
        transaction.taxPercent = matchingClassifiedTransaction.taxPercent;
        transaction.isEquipment = matchingClassifiedTransaction.isEquipment;
        transaction.reductionPercent = matchingClassifiedTransaction.reductionPercent;
      }
      else {
        console.log("no match: ", transaction.name, transaction.billName, transaction.paymentIdentifier);
      }

      transactionsToSave.push(transaction);

    }

    await this.transactionsRepo.save(transactionsToSave);

    console.log("Successfully saved = ", transactionsToSave.length - skippedTransactions);
    console.log("skippedTransactions = ", skippedTransactions);
    console.log("Loading transaction done");

    return { message: `Successfully saved ${filteredRows.length - skippedTransactions} transactions to the database. Skipped ${skippedTransactions} duplicate transactions.` };

  }


  async getBusinessNumberByBillId(billId: number, userId: string): Promise<string | null> {
    const bill = await this.billRepo.findOne({
      where: { id: billId, userId },
      select: ['businessNumber'],
    });
    return bill?.businessNumber ?? null;
  }

  async getBusinessNumberByBillName(userId: string, billName: string): Promise<string | null> {
    const bill = await this.billRepo.findOne({
      where: {
        userId,
        billName,
      },
      select: ['businessNumber'], // Only fetch the businessNumber for optimization
    });
    return bill ? bill.businessNumber : null; // Return the businessNumber if found, otherwise null
  }


  async getBillIdByBillName(userId: string, billName: string): Promise<number | null> {
    if (!billName) return null;
    const bill = await this.billRepo.findOne({
      where: { userId, billName },
      select: ['id'],
    });
    return bill ? bill.id : null;
  }

  async getBillNameByBillId(userId: string, billId: number): Promise<string | null> {
    if (!billId) return null;
    const bill = await this.billRepo.findOne({
      where: { userId, id: billId },
      select: ['billName'],
    });
    return bill ? bill.billName : null;
  }

  async getBillNameBySourceName(userId: string, sourceName: string): Promise<string | null> {
    const source = await this.sourceRepo.findOne({
      where: { sourceName, userId },
      relations: ['bill'],
    });

    if (!source || !source.bill || source.bill.userId !== userId) {
      return null;
    }

    return source.bill.billName;
  }


  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: reads all legacy transactions for a user. No known active caller; likely dead code. Remove when legacy table is dropped.
  async getTransactionsByUserID(userId: string) {
    return await this.transactionsRepo.find({ where: { userId: userId } });
  }










  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: legacy quickClassify that operates on the transactions table by numeric id.
  // The new path is TransactionsController → TransactionProcessingService.classifyManually() via finsiteId.
  // This method is no longer called from the controller; remove when legacy table is dropped.
  /** Returns true when the transaction's absolute sum falls within the rule's defined range (or no range is set). */
  private ruleMatchesSum(rule: ClassifiedTransactions, sum: number): boolean {
    const absSum = Math.abs(sum);
    if (rule.minAbsSum != null && absSum < Number(rule.minAbsSum)) return false;
    if (rule.maxAbsSum != null && absSum > Number(rule.maxAbsSum)) return false;
    return true;
  }

  async quickClassify(transactionId: number, userId: string): Promise<void> {

    const transaction = await this.transactionsRepo.findOne({
      where: { id: transactionId, userId },
    });

    if (!transaction) {
      throw new NotFoundException(`Transaction with ID ${transactionId} not found`);
    }

    transaction.category = 'שונות';
    transaction.subCategory = 'שונות';
    transaction.taxPercent = 0;
    transaction.vatPercent = 0;
    transaction.reductionPercent = 0;
    transaction.isEquipment = false;
    transaction.isRecognized = false;

    await this.transactionsRepo.save(transaction);
  }



  async updateTransaction(updateDto: UpdateTransactionsDto, userId: string, startDate: Date, endDate: Date): Promise<void> {
    const {
      id,
      isSingleUpdate,
      category,
      subCategory,
      isRecognized,
      vatPercent,
      taxPercent,
      isEquipment,
      reductionPercent,
      businessNumber,
    } = updateDto;

    // ── 1. Resolve the target cache rows ────────────────────────────────────
    // `id` is a full_transactions_cache PK (the frontend receives cache rows
    // from getExpenses/getIncomes which map cache.id → id in the response).
    let cacheRows: FullTransactionCache[];

    if (isSingleUpdate) {
      const row = await this.cacheRepo.findOne({ where: { id, userId } });
      if (!row) {
        throw new NotFoundException(`Transaction with id ${id} not found.`);
      }
      cacheRows = [row];
    } else {
      // Multi-update: find all cache rows for the same merchant + bill.
      // DTO.name maps to merchantName; DTO.billName maps to billName.
      cacheRows = await this.cacheRepo.find({
        where: {
          userId,
          merchantName: updateDto.name,
          billName: updateDto.billName,
        },
      });
    }

    if (cacheRows.length === 0) return;

    // ── 2. Bulk-load the corresponding slim rows in one query ────────────────
    const externalIds = cacheRows.map((r) => r.externalTransactionId);
    const slimRows = await this.slimRepo.find({
      where: { userId, externalTransactionId: In(externalIds) },
    });
    const slimMap = new Map(slimRows.map((s) => [s.externalTransactionId, s]));

    // ── 3. Apply updates to cache rows (read model / display data) ───────────
    for (const row of cacheRows) {
      if (category !== undefined)        row.category = category;
      if (subCategory !== undefined)     row.subCategory = subCategory;
      if (isRecognized !== undefined)    row.isRecognized = isRecognized;
      if (vatPercent !== undefined)      row.vatPercent = vatPercent;
      if (taxPercent !== undefined)      row.taxPercent = taxPercent;
      if (isEquipment !== undefined)     row.isEquipment = isEquipment;
      if (reductionPercent !== undefined) row.reductionPercent = reductionPercent;
      if (businessNumber !== undefined)  row.businessNumber = businessNumber;
    }
    await this.cacheRepo.save(cacheRows);

    // ── 4. Apply updates to slim rows (application state) ───────────────────
    // Only update slim rows that already exist. If no slim row exists for a
    // cache row, the transaction has not been classified yet — skip it here;
    // the classification flow will create the slim row when it runs.
    const slimToSave: SlimTransaction[] = [];
    for (const row of cacheRows) {
      const slim = slimMap.get(row.externalTransactionId);
      if (!slim) continue;

      if (category !== undefined)        slim.category = category;
      if (subCategory !== undefined)     slim.subCategory = subCategory;
      if (isRecognized !== undefined)    slim.isRecognized = isRecognized;
      if (vatPercent !== undefined)      slim.vatPercent = vatPercent;
      if (taxPercent !== undefined)      slim.taxPercent = taxPercent;
      if (isEquipment !== undefined)     slim.isEquipment = isEquipment;
      if (reductionPercent !== undefined) slim.reductionPercent = reductionPercent;
      if (businessNumber !== undefined)  slim.businessNumber = businessNumber;
      slimToSave.push(slim);
    }
    if (slimToSave.length > 0) {
      await this.slimRepo.save(slimToSave);
    }
  }


  ///////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////               Bills                 /////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////////////

  async addBill(userId: string, createBillDto: CreateBillDto) {
    const isAlreadyExist = await this.billRepo.findOne({ where: { userId: userId, billName: createBillDto.billName } });
    if (isAlreadyExist) {
      throw new HttpException({
        status: HttpStatus.CONFLICT,
        error: `Bill with this name: "${createBillDto.billName}" already exists`
      }, HttpStatus.CONFLICT);
    }

    const bill = this.billRepo.create({
      userId: userId,
      billName: createBillDto.billName,
      businessNumber: createBillDto.businessNumber
    });
    return this.billRepo.save(bill);
  }


  async deleteBill(id: number, userId: string): Promise<void> {
    const bill = await this.billRepo.findOne({ where: { id } });
    if (!bill) {
      throw new NotFoundException(`Bill with ID ${id} not found`);
    }
    //Check if the user making the request is the owner of the expense
    if (bill.userId !== userId) {
      throw new UnauthorizedException(`You do not have permission to delete this bill`);
    }
    await this.billRepo.remove(bill);
  }


  findOne(id: number): Promise<Bill> {
    return this.billRepo.findOne({ where: { id }, relations: ['sources'] });
  }


  async addSourceToBill(billId: number, sourceName: string, sourceType: SourceType, userId: string): Promise<Source> {

    if (!sourceType || !Object.values(SourceType).includes(sourceType)) {
      throw new BadRequestException(
        `sourceType is required and must be one of: ${Object.values(SourceType).join(', ')}`,
      );
    }

    const bill = await this.billRepo.findOne({ where: { id: billId, userId }, relations: ['sources'] });
    if (!bill) {
      throw new NotFoundException('Bill not found');
    }

    const existing = await this.sourceRepo.findOne({
      where: { userId, sourceName },
    });
    if (!existing) {
      throw new NotFoundException(
        `אמצעי התשלום "${sourceName}" לא נמצא בטבלת המקורות (source). ` +
          'רק מקורות שכבר קיימים במערכת (למשל לאחר סנכרון בנקאות פתוחה) ניתן לשייך לחשבון.',
      );
    }

    if (existing.sourceType !== sourceType) {
      throw new BadRequestException(
        `סוג אמצעי התשלום לא תואם לרשומה השמורה (שמור: ${existing.sourceType}, התקבל: ${sourceType}).`,
      );
    }

    existing.bill = bill;
    await this.sourceRepo.save(existing);

    // Backfill: update all full_transactions_cache rows that already carry this
    // paymentIdentifier so they become linked to the bill immediately.
    // Does NOT touch the legacy transactions table or slim_transactions.
    await this.cacheRepo.update(
      { userId, paymentIdentifier: sourceName },
      {
        billId: bill.id,
        billName: bill.billName,
        businessNumber: bill.businessNumber ?? null,
      },
    );

    return existing;
  }


  async getBillsByUserId(userId: string): Promise<Bill[]> {

    const bills = await this.billRepo.find({
      where: { userId: userId }
    });
    if (!bills || bills.length === 0) {
      return [];
    }
    return bills;

  }

  async getSourcesByBillId(userId: string, billId: number): Promise<string[]> {
    let sources: string[] = [];

    const bill = await this.billRepo.findOne({ where: { userId, id: billId }, relations: ['sources'] });
    if (!bill) {
      return [];
    }

    sources.push(...bill.sources.map(source => source.sourceName));

    return sources;
  }


  async getSources(userId: string): Promise<string[]> {
    let sources: string[] = [];

    // Get all bills for the user
    const bills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
    if (!bills || bills.length === 0) {
      return [];
    }

    if (bills.length > 0) {
      bills.forEach(bill => {
        sources.push(...bill.sources.map(source => source.sourceName));
      });
    }

    return sources;
  }

  /**
   * Sources list for the settings page. Driven by user_source_sync_state
   * (refreshed on every discovery → reflects currently-connected accounts).
   * billName is joined from `source` (sourceName == sourceId); no Bill link →
   * null (frontend shows «לא משויך»). hasConsent = user_source_sync_state
   * .consentId non-null (revoke/expire nulls it via clearConsentOnSources).
   */
  async getSourcesWithTypes(
    userId: string,
  ): Promise<{ sourceName: string; sourceType: SourceType; billName: string | null; hasConsent: boolean }[]> {
    // The list is driven by user_source_sync_state — it's refreshed on every
    // discovery (getUserAccounts) so it reflects the currently-connected
    // accounts + their consent validity. `source` is consulted only for the
    // Bill mapping (billName), joined by sourceName == sourceId.
    const [syncStates, sourceRows] = await Promise.all([
      this.userSourceSyncStateRepo.find({ where: { userId } }),
      this.sourceRepo.find({ where: { userId }, relations: ['bill'] }),
    ]);
    const billBySourceName = new Map(
      sourceRows.map((r) => [r.sourceName, r.bill?.billName ?? null]),
    );
    return syncStates.map((s) => ({
      sourceName: s.sourceId,
      sourceType: s.type === 'card' ? SourceType.CREDIT_CARD : SourceType.BANK_ACCOUNT,
      billName: billBySourceName.get(s.sourceId) ?? null,
      hasConsent: !!s.consentId,
    }));
  }


  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: core read query against the legacy transactions table. Feeds getIncomesTransactions, getExpensesTransactions, and tax-income calculations.
  // Replace with equivalent queries against full_transactions_cache, then remove this method and all callers below.
  async getTransactionsByBillAndUserId(
    userId: string,
    startDate: Date,
    endDate: Date,
    billIds: string[] | null,
    categories: string[] | null,
    sourcesFilter: string[] | null
  ): Promise<Transactions[]> {

    const normalizedSources = Array.isArray(sourcesFilter)
      ? [...new Set(sourcesFilter.map(s => (s ?? '').trim()).filter(Boolean))]
      : null;

    // 1) Load all user's bills (with their 'sources' relation) so we can derive identifiers.
    const allBills = await this.billRepo.find({
      where: { userId },
      relations: ['sources'],
    });

    // 2) Prepare selection flags/collections based on the incoming billIds filter.
    let includeUnlinked: boolean;
    let billIdNums: number[] = [];
    let selectedBills: typeof allBills;

    if (billIds === null) {
      // If no filter was provided -> include ALL bills AND also include "unlinked".
      includeUnlinked = true;
      selectedBills = allBills;
    } else {
      // 'notBelong' is a special token meaning "include unlinked transactions".
      includeUnlinked = billIds.includes('notBelong');

      // Keep only numeric bill ids
      billIdNums = billIds
        .filter((id) => id !== 'notBelong')
        .map((id) => parseInt(id, 10));

      // Narrow the bills we care about to the selected list
      selectedBills = allBills.filter((bill) => billIdNums.includes(bill.id));
    }

    // 3) Build the identifiers:
    //    - 'sources' = identifiers of SELECTED bills
    //    - 'allIdentifiers' = identifiers of ALL user's bills
    const sources: string[] = selectedBills.flatMap((bill) =>
      bill.sources.map((source) => source.sourceName),
    );

    const allIdentifiers: string[] = allBills.flatMap((bill) =>
      bill.sources.map((source) => source.sourceName),
    );

    // 4) Start the query restricted to the current user
    const queryBuilder = this.transactionsRepo.createQueryBuilder('transaction');
    queryBuilder.where('transaction.userId = :userId', { userId });

    // 5) Filter by paymentIdentifier (linked vs unlinked)
    queryBuilder.andWhere(
      new Brackets((qb) => {
        const hasSources = sources.length > 0;
        const hasAllIds = allIdentifiers.length > 0;

        if (hasSources) {
          // If some bills were selected, include transactions whose paymentIdentifier matches them:
          qb.where('transaction.paymentIdentifier IN (:...sources)', { sources });

          if (includeUnlinked) {
            // Also include "unlinked":
            //  - paymentIdentifier NOT in ANY known identifier
            //  - OR paymentIdentifier IS NULL
            if (hasAllIds) {
              qb.orWhere(
                'transaction.paymentIdentifier NOT IN (:...allIdentifiers)',
                { allIdentifiers },
              );
            } else {
              // FIX PATH: when there are NO known identifiers at all,
              // we must AVOID `NOT IN ()`. Using `1=1` keeps the bracket valid
              // and effectively means "no linked ids exist, so treat all as unlinked".
              qb.orWhere('1=1');
            }
            qb.orWhere('transaction.paymentIdentifier IS NULL');
          }
        } else if (includeUnlinked) {
          // No specific bills selected, but "unlinked" requested:
          if (hasAllIds) {
            qb.where(
              'transaction.paymentIdentifier NOT IN (:...allIdentifiers)',
              { allIdentifiers },
            );
          } else {
            // FIX PATH: again, avoid `NOT IN ()` when allIdentifiers is empty
            // (nothing is recognized as linked, so everything is effectively unlinked)
            qb.where('1=1');
          }
          qb.orWhere('transaction.paymentIdentifier IS NULL');
        } else {
          // Neither bills selected nor "unlinked" requested -> return nothing.
          qb.where('1 = 0');
        }
      }),
    );
    if (normalizedSources && normalizedSources.length > 0) {
      queryBuilder.andWhere('transaction.paymentIdentifier IN (:...normalizedSources)', {
        normalizedSources,
      });
    }

    // 6) Category filter — known names come from the NEW catalog (Phase 4.6:
    // the old default_category ∪ user_category read is gone; same semantics —
    // SYSTEM names plus every category this user created, across businesses).
    const allCategoriesName: string[] = await this.catalogService.getCategoryNamesForUser(userId);

    if (categories && categories.length > 0 && allCategoriesName.length > 0) {
      // Include:
      //  - categories explicitly selected,
      //  - OR anything not recognized in our combined category list,
      //  - OR NULL categories.
      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('transaction.category IN (:...categories)', { categories });
          qb.orWhere('transaction.category NOT IN (:...allCategoriesName)', {
            allCategoriesName,
          });
          qb.orWhere('transaction.category IS NULL');
        }),
      );
    }

    // 7) Date range filter (inclusive by DATE() casting)
    queryBuilder.andWhere(
      'DATE(transaction.billDate) BETWEEN :startDate AND :endDate',
      { startDate, endDate },
    );

    // 8) Sort newest-first
    queryBuilder.orderBy('transaction.billDate', 'DESC');

    // 9) Execute
    const transactions = await queryBuilder.getMany();
    return transactions;
  }


  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: reads income/expense rows from the legacy transactions table via getTransactionsByBillAndUserId. Remove once reports are migrated to full_transactions_cache.
  async getIncomesTransactions(userId: string, startDate: Date, endDate: Date, billId: string[] | null, categories: string[] | null, sources: string[] | null): Promise<Transactions[]> {

    const transactions = await this.getTransactionsByBillAndUserId(userId, startDate, endDate, billId, categories, sources);
    //console.log("Transactions:\n", transactions)
    const incomeTransactions = transactions.filter(transaction => transaction.sum > 0);
    //console.log("incomeTransactions:\n", incomeTransactions)
    return incomeTransactions;

  }


  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: same as getIncomesTransactions — legacy table read. Remove together.
  async getExpensesTransactions(userId: string, startDate: Date, endDate: Date, billId: string[] | null, categories: string[] | null, sources: string[] | null): Promise<Transactions[]> {
    console.log("🚀 ~ TransactionsService ~ getExpensesTransactions ~ billId:", billId)

    const transactions = await this.getTransactionsByBillAndUserId(userId, startDate, endDate, billId, categories, sources);
    //console.log("Transactions:\n", transactions)
    const expenseTransactions = transactions.filter(transaction => transaction.sum < 0);
    //console.log("expenseTransactions:\n", expenseTransactions)
    return expenseTransactions;

  }


  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: income-tax and VAT-report calculations that depend on legacy table reads via getIncomesTransactions.
  // Migrate to full_transactions_cache reads, then remove getTaxableIncomefromTransactions and getTaxableIncomefromTransactionsForVatReport.
  async getTaxableIncomefromTransactions(userId: string, businessNumber: string, startDate: Date, endDate: Date): Promise<number> {

    const incomeTransactions = await this.getIncomesTransactions(userId, startDate, endDate, null, null, null);

    // Filter incomeTransactions by isRecognized = true and businessNumber = businessNumber
    const businessIncomeTransactions = incomeTransactions.filter(transaction =>
      transaction.isRecognized === true && transaction.businessNumber === businessNumber
    );

    // Calculate the total income
    let totalIncome = 0;
    for (const transaction of businessIncomeTransactions) {
      totalIncome += Number(transaction.sum); // Convert sum to a number
    }

    return totalIncome;
  }


  async getTaxableIncomefromTransactionsForVatReport(userId: string, businessNumber: string, startDate: Date, endDate: Date): Promise<{ vatableIncome: number; noneVatableIncome: number }> {

    // Get all incomes from all bills
    const incomeTransactions = await this.getIncomesTransactions(userId, startDate, endDate, null, null, null);

    // Get the VAT rate per year
    const year = startDate.getFullYear();
    const vatRate = this.sharedService.getVatPercent(year);

    // Filter transactions classified as "הכנסה מעסק"
    const businessIncomeTransactions = incomeTransactions.filter(transaction =>
      transaction.businessNumber === businessNumber
    );

    // Filter transactions classified as "הכנסה מעסק"
    const vatableIncomeTransactions = businessIncomeTransactions.filter(transaction =>
      transaction.category === "הכנסה מעסק" && transaction.subCategory === 'הכנסה חייבת במע"מ'
    );

    const noneVatableIncomeTransactions = businessIncomeTransactions.filter(transaction =>
      transaction.category === "הכנסה מעסק" && transaction.subCategory === 'הכנסה פטורה ממע"מ'
    );

    // Calculate the total vatable income
    let vatableIncome = 0;
    for (const transaction of vatableIncomeTransactions) {
      vatableIncome += Number(transaction.sum);
    }
    // Calculate net income (excluding VAT)
    vatableIncome = Math.round(vatableIncome / (1 + vatRate));

    // Calculate the total non-vatable income
    let noneVatableIncome = 0;
    for (const transaction of noneVatableIncomeTransactions) {
      noneVatableIncome += Number(transaction.sum);
    }

    console.log("vatableIncome is ", vatableIncome);
    console.log("noneVatableIncome is ", noneVatableIncome);


    return { vatableIncome, noneVatableIncome };
  }



  async getTransactionToConfirmAndAddToExpenses(
    userId: string,
    businessNumber: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Record<string, any>[]> {

    // Translate the report's date range into the period labels that span it.
    // Late stragglers whose `transactionDate` is outside the range but whose
    // `vatReportingDate` falls inside it (because the user reassigned them
    // from a locked period) should still surface in the confirm-trans dialog.
    let periodLabels: string[] = [];
    if (businessNumber && businessNumber !== 'ALL_BILLS') {
      const business = await this.businessRepo.findOne({
        where: { firebaseId: userId, businessNumber },
      });
      if (business) {
        periodLabels = this.sharedService.expandPeriodLabelsInRange(
          business.businessType ?? BusinessType.EXEMPT,
          business.vatReportingType ?? VATReportingType.NOT_REQUIRED,
          startDate,
          endDate,
        );
      }
    }

    // Join slim_transactions only for its confirmed state.
    // Rows with no slim row are treated as confirmed = false (LEFT JOIN IS NULL).
    const qb = this.cacheRepo
      .createQueryBuilder('c')
      .leftJoin(
        SlimTransaction,
        's',
        's.userId = c.userId AND s.externalTransactionId = c.externalTransactionId',
      )
      .where('c.userId = :userId', { userId })
      .andWhere('c.isRecognized = true')
      .andWhere('c.amount < 0')
      // slim.confirmed IS NULL  → no slim row yet → treat as unconfirmed
      // slim.confirmed = false  → explicitly not yet confirmed
      .andWhere('(s.confirmed IS NULL OR s.confirmed = false)');

    if (periodLabels.length > 0) {
      // Period-stamped (classified) rows → match by label. Unclassified rows
      // (no slim row → vatReportingDate IS NULL on cache too) → match by
      // transactionDate so the user can still classify+confirm them.
      qb.andWhere(
        '(c.vatReportingDate IN (:...labels) OR (c.vatReportingDate IS NULL AND DATE(c.transactionDate) BETWEEN :startDate AND :endDate))',
        { labels: periodLabels, startDate, endDate },
      );
    } else {
      qb.andWhere('DATE(c.transactionDate) BETWEEN :startDate AND :endDate', { startDate, endDate });
    }

    if (businessNumber && businessNumber !== 'ALL_BILLS') {
      qb.andWhere('c.businessNumber = :businessNumber', { businessNumber });
    }

    qb.orderBy('c.transactionDate', 'DESC');

    const rows = await qb.getMany();

    return rows.map((r) => {
      // Same canonical formula used by expenses.service.ts:59,65 when an
      // expense is saved. Cache amounts are negative for expenses; the
      // expense formula expects a positive base, so use Math.abs.
      const absSum = Math.abs(Number(r.amount));
      const vatRate = this.sharedService.getVatRateByYear(new Date(r.transactionDate));
      const totalVatPayable =
        (absSum / (1 + vatRate)) * vatRate * (Number(r.vatPercent) / 100);
      const totalTaxPayable =
        (absSum - totalVatPayable) * (Number(r.taxPercent) / 100);

      return {
        id: r.id,
        finsiteId: r.externalTransactionId,
        userId: r.userId,
        paymentIdentifier: r.paymentIdentifier,
        billName: r.billName,
        businessNumber: r.businessNumber,
        name: r.merchantName,
        note2: r.note,
        billDate: r.transactionDate,
        payDate: r.paymentDate,
        sum: r.amount,
        currency: r.currency ?? 'ILS',
        category: r.category,
        subCategory: r.subCategory,
        isRecognized: r.isRecognized,
        vatPercent: r.vatPercent,
        taxPercent: r.taxPercent,
        totalVatPayable,
        totalTaxPayable,
        isEquipment: r.isEquipment,
        reductionPercent: r.reductionPercent,
        vatReportingDate: r.vatReportingDate,
        confirmed: false, // only unconfirmed rows reach here
      };
    });
  }


  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: reads unclassified rows from the legacy transactions table. Not used by the current classify flow (which uses TransactionProcessingService.getTransactionsToClassify against full_transactions_cache). Remove when legacy table is dropped.
  async getTransactionToClassify(
    userId: string,
    startDate?: Date,
    endDate?: Date,
    businessNumber?: string
  ): Promise<Transactions[]> {

    const where: FindOptionsWhere<Transactions> = {
      userId,
      category: null
    };

    if (startDate && endDate) {
      where.billDate = Between(startDate, endDate);
    } else if (startDate) {
      where.billDate = MoreThanOrEqual(startDate);
    } else if (endDate) {
      where.billDate = LessThanOrEqual(endDate);
    }

    if (businessNumber) {
      where.businessNumber = businessNumber;
    }

    const transactions = await this.transactionsRepo.find({ where });

    return transactions;
  }


  // TODO_FINTAX_REMOVE_LEGACY_TRANSACTIONS: reads recognised income rows from the legacy transactions table for the confirm-to-expenses report. Replace with a full_transactions_cache read, then remove.
  async getIncomesToBuildReport(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Transactions[]> {

    const incomes = await this.transactionsRepo.find({
      where: [
        {
          userId,
          billDate: Between(startDate, endDate),
          isRecognized: true,
          sum: MoreThan(0)
        },
      ]
    });

    return incomes;

  }


  async saveTransactionsToExpenses(transactionData: { id: number, file?: string | null }[], userId: string): Promise<{ message: string }> {

    // Frontend sends cache row `id`. Resolve to full cache rows first,
    // then derive externalTransactionId for all slim state operations.
    const cacheIds = transactionData.map(td => td.id);

    const cacheRows = await this.cacheRepo.findBy({
      id: In(cacheIds),
      userId,
    });

    if (!cacheRows || cacheRows.length === 0) {
      throw new Error('No transactions found with the provided IDs.');
    }

    // Load existing slim rows so we can use the period label already stamped
    // at classification time. Confirm-trans no longer (re)computes the period;
    // it only flips `confirmed = true`.
    const externalIds = cacheRows.map((r) => r.externalTransactionId);
    const slimRows = externalIds.length > 0
      ? await this.slimRepo.find({ where: { userId, externalTransactionId: In(externalIds) } })
      : [];
    const slimByExternalId = new Map(slimRows.map((s) => [s.externalTransactionId, s]));

    // ── Build and save Expense entities ───────────────────────────────────────
    const expenses: Expense[] = [];
    let skippedTransactions = 0;

    for (const row of cacheRows) {
      const transactionFile = transactionData.find(td => td.id === row.id)?.file || '';

      const existingExpense = await this.expenseRepo.findOne({
        where: [
          { userId: row.userId, externalTransactionId: row.externalTransactionId },
          // Fallback for legacy Expenses created before externalTransactionId was linked.
          {
            userId: row.userId,
            date: row.transactionDate,
            supplier: row.merchantName,
            sum: Math.abs(Number(row.amount)),
          },
        ],
      });

      if (existingExpense) {
        // Backfill the link on legacy rows so future re-classifications can
        // sync this Expense via the externalTransactionId path.
        if (!existingExpense.externalTransactionId) {
          existingExpense.externalTransactionId = row.externalTransactionId;
          await this.expenseRepo.save(existingExpense);
        }
        skippedTransactions++;
        continue;
      }

      const slim = slimByExternalId.get(row.externalTransactionId);
      // Expense.sum is always in ILS. For non-ILS transactions the cache row
      // carries `ilsAmount` (stamped at sync via FxRateService). Fall back to
      // `amount` for ILS rows and for rows where FX resolution failed at
      // sync time — `currency` stays on the source for audit.
      const sumIls = row.ilsAmount != null
        ? Math.abs(Number(row.ilsAmount))
        : Math.abs(Number(row.amount));

      const isForeignCurrency = row.currency != null && row.currency.toUpperCase() !== 'ILS';

      const expense = new Expense();
      expense.supplier = row.merchantName;
      expense.supplierID = '';
      expense.category = row.category;
      expense.subCategory = row.subCategory;
      expense.sum = sumIls;
      expense.taxPercentSnapshot = row.taxPercent;
      expense.vatPercentSnapshot = row.vatPercent;
      expense.date = row.transactionDate;
      expense.note = '';
      expense.file = transactionFile as string;
      expense.isEquipmentSnapshot = row.isEquipment;
      expense.userId = row.userId;
      expense.loadingDate = new Date();
      expense.expenseNumber = '';
      expense.transId = null;
      expense.externalTransactionId = row.externalTransactionId;
      // For non-ILS source rows, mirror the original currency + amount onto
      // the Expense so the expenses table can render "$X (₪Y)".
      expense.originalCurrency = isForeignCurrency ? row.currency!.toUpperCase() : null;
      expense.originalSum = isForeignCurrency ? Math.abs(Number(row.amount)) : null;
      expense.reductionPercentSnapshot = row.reductionPercent;
      expense.businessNumber = row.businessNumber;
      expense.vatReportingDate = (slim?.vatReportingDate ?? row.vatReportingDate ?? null) as any;
      // Snapshot the report scope (slim wins, then cache, default PNL).
      // pnlCategory is intentionally NOT set here — it stays NULL and is
      // resolved live from the subcategory (with an optional per-expense
      // override set later via the Edit dialog).
      expense.reportScope = slim?.reportScope ?? row.reportScope ?? ExpenseReportScope.PNL;

      const vatRate = this.sharedService.getVatRateByYear(new Date(expense.date));
      expense.totalVatPayable = (expense.sum / (1 + vatRate)) * vatRate * (expense.vatPercentSnapshot / 100);
      expense.totalTaxPayable = (expense.sum - expense.totalVatPayable) * (expense.taxPercentSnapshot / 100);

      const purchaseYear = new Date(expense.date).getFullYear();
      const purchaseMonth = new Date(expense.date).getMonth() + 1;
      if (expense.reductionPercentSnapshot) {
        const fullReductionYears = Math.ceil(100 / expense.reductionPercentSnapshot);
        const isPartialYear = purchaseMonth > 1 || new Date(expense.date).getDate() > 1;
        expense.reductionDone = purchaseYear + fullReductionYears + (isPartialYear ? 1 : 0) - 1;
      } else {
        expense.reductionDone = 0;
      }

      expenses.push(expense);
    }

    if (expenses.length > 0) {
      const savedExpenses = await this.expenseRepo.save(expenses);
      // Post a journal entry for each newly-created expense via the SAME shared
      // path used by manual entry and OCR documents (createExpenseJournalEntry),
      // so a bank-transaction expense produces an identical journal entry.
      // Best-effort per expense — the helper swallows its own failures.
      for (const saved of savedExpenses) {
        await this.expenseService.createExpenseJournalEntry(saved);
      }
    }

    // ── Mark confirmed in slim_transactions ───────────────────────────────────
    // Period is already on the slim row (stamped at classification). Confirm
    // only flips `confirmed = true`. Rows without billId are skipped — a
    // valid slim row requires it.
    const slimUpserts = cacheRows
      .filter(r => r.billId != null && r.classificationType != null && r.category != null && r.subCategory != null)
      .map((r) => {
        const slim = slimByExternalId.get(r.externalTransactionId);
        return {
          userId: r.userId,
          externalTransactionId: r.externalTransactionId,
          billId: r.billId,
          classificationType: r.classificationType,
          category: r.category,
          subCategory: r.subCategory,
          vatPercent: r.vatPercent,
          taxPercent: r.taxPercent,
          reductionPercent: r.reductionPercent,
          isEquipment: r.isEquipment,
          isRecognized: r.isRecognized,
          reportScope: r.reportScope,
          businessNumber: r.businessNumber,
          confirmed: true,
          // Prefer the period label already on the slim row (set at classify).
          // Fall back to the cache row's stamp for any path that bypassed
          // classify (legacy / manual ingest).
          vatReportingDate: slim?.vatReportingDate ?? r.vatReportingDate ?? null,
        };
      });

    if (slimUpserts.length > 0) {
      await this.slimRepo
        .createQueryBuilder()
        .insert()
        .into(SlimTransaction)
        .values(slimUpserts as SlimTransaction[])
        .orUpdate(['confirmed'], ['userId', 'externalTransactionId'])
        .updateEntity(false)
        .execute();
    }

    // Mirror `confirmed = true` onto the cache so the תזרים column renderer
    // can show the green V immediately.
    await this.cacheRepo.update(
      { id: In(cacheRows.map((r) => r.id)), userId },
      { confirmed: true },
    );

    const message = `Successfully converted ${expenses.length} transactions to expenses. ${skippedTransactions} transactions were skipped because they already exist as expenses.`;
    return { message };
  }

  async getDistinctMerchants(userId: string, billId?: number): Promise<string[]> {
    const qb = this.cacheRepo
      .createQueryBuilder('c')
      .select('DISTINCT TRIM(c.merchantName)', 'merchantName')
      .where('c.userId = :userId', { userId })
      .andWhere('c.merchantName IS NOT NULL')
      .andWhere("TRIM(c.merchantName) != ''");

    if (billId) {
      qb.andWhere('c.billId = :billId', { billId });
    }

    qb.orderBy('merchantName', 'ASC');
    const rows = await qb.getRawMany<{ merchantName: string }>();
    return rows.map(r => r.merchantName);
  }

}
