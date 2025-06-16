import { Injectable, BadRequestException, NotFoundException, HttpException, HttpStatus, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, Not, Brackets, LessThan, MoreThan } from 'typeorm';
import * as XLSX from 'xlsx';
import { Express } from 'express';
import { SourceType, VATReportingType } from 'src/enum';

//Entities
import { Transactions } from './transactions.entity';
import { Bill } from './bill.entity';
import { Source } from './source.entity';
import { ClassifiedTransactions } from './classified-transactions.entity';
import { Expense } from '../expenses/expenses.entity';
import { Finsite } from 'src/finsite/finsite.entity';

//Services
import { SharedService } from '../shared/shared.service';
import { ExpensesService } from '../expenses/expenses.service';
import { FinsiteService } from 'src/finsite/finsite.service';

//DTOs
import { UpdateTransactionsDto } from './dtos/update-transactions.dto';
import { ClassifyTransactionDto } from './dtos/classify-transaction.dto';
import { DefaultCategory } from '../expenses/default-categories.entity';
import { DefaultSubCategory } from '../expenses/default-sub-categories.entity';
import { CreateUserCategoryDto } from '../expenses/dtos/create-user-category.dto';
import { User } from 'src/users/user.entity';
import { UserCategory } from 'src/expenses/user-categories.entity';
import { CreateBillDto } from './dtos/create-bill.dto';
import * as fs from 'fs';
import { UserSubCategory } from 'src/expenses/user-sub-categories.entity';


@Injectable()
export class TransactionsService {
  constructor(
    private readonly sharedService: SharedService,
    private readonly expenseService: ExpensesService,
    private readonly finsiteService: FinsiteService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
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
    @InjectRepository(DefaultCategory)
    private categoryRepo: Repository<DefaultCategory>,
    @InjectRepository(DefaultSubCategory)
    private defaultSubCategoryRepo: Repository<DefaultSubCategory>,
    @InjectRepository(UserCategory)
    private userCategoryRepo: Repository<UserCategory>,
    @InjectRepository(UserSubCategory)
    private userSubCategoryRepo: Repository<UserSubCategory>
  ) { }


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

                const classifiedTransaction = await this.classifiedTransactionsRepo.findOne({
                  where: {
                    userId: firebaseId,
                    transactionName: transaction.Notes1,
                    billName: billName,
                  },
                });

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
                  sum: transaction.Debit ? -transaction.Debit : transaction.Credit,
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

    // Fetch user's bills and create a mapping from paymentIdentifier to billName
    const userBills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
    const paymentIdentifierToBillName = new Map<string, string>();

    userBills.forEach(bill => {
      bill.sources.forEach(source => {
        paymentIdentifierToBillName.set(source.sourceName, bill.billName);
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
      const matchingClassifiedTransaction = classifiedTransactions.find(ct => ct.transactionName === transaction.name && ct.billName === transaction.billName);
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


  async loadDefaultCategories(file: Express.Multer.File): Promise<{ message: string }> {

    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }); // Get rows as arrays of values, raw: false to get formatted strings

    // Assuming the first row contains headers
    const headers = rows.shift();

    // Dynamically find the index of each column based on the header names
    const categoryIndex = headers.findIndex(header => header === 'categoryName');
    const subCategoryIndex = headers.findIndex(header => header === 'subCategoryName');
    const taxPercentIndex = headers.findIndex(header => header === 'taxPercent');
    const vatPercentIndex = headers.findIndex(header => header === 'vatPercent');
    const reductionPercentIndex = headers.findIndex(header => header === 'reductionPercent');
    const isEquipmentIndex = headers.findIndex(header => header === 'isEquipment');
    const isRecognizedIndex = headers.findIndex(header => header === 'isRecognized');
    const isExpenseIndex = headers.findIndex(header => header === 'isExpense');


    for (const row of rows) {
      const categoryName = row[categoryIndex];
      const subCategoryName = row[subCategoryIndex];
      const taxPercent = parseFloat(row[taxPercentIndex]);
      const vatPercent = parseFloat(row[vatPercentIndex]);
      const reductionPercent = parseFloat(row[reductionPercentIndex]);
      const isEquipment = row[isEquipmentIndex] == '1' || row[isEquipmentIndex] == 'true';  // Boolean conversion
      const isRecognized = row[isRecognizedIndex] == '1' || row[isRecognizedIndex] == 'true'; // Boolean conversion
      const isExpense = row[isExpenseIndex] == '1' || row[isExpenseIndex] == 'true'; // Boolean conversion

      // Check if the category already exists
      let category = await this.categoryRepo.findOne({ where: { categoryName: categoryName } });
      if (!category) {
        // Create a new category if it doesn't exist
        category = this.categoryRepo.create({
          categoryName: categoryName,
          isExpense: isExpense
        });
        await this.categoryRepo.save(category);
      }

      // Check if the sub-category already exists
      let subCategory = await this.defaultSubCategoryRepo.findOne({ where: { subCategoryName: subCategoryName } });
      if (!subCategory) {
        // Create a new sub-category if it doesn't exist
        subCategory = this.defaultSubCategoryRepo.create({
          subCategoryName: subCategoryName,
          taxPercent: taxPercent,
          vatPercent: vatPercent,
          reductionPercent: reductionPercent,
          isEquipment: isEquipment,
          isRecognized: isRecognized,
          isExpense: isExpense,
          categoryName: categoryName
        });
        await this.defaultSubCategoryRepo.save(subCategory);
      }

    }

    return { message: `Successfully saved categories and sub-categories.` };

  }


  async getTransactionsByUserID(userId: string) {
    return await this.transactionsRepo.find({ where: { userId: userId } });
  }


  async classifyTransaction(classifyDto: ClassifyTransactionDto, userId: string, startDate?: Date, endDate?: Date): Promise<void> {

    const { id, isSingleUpdate, name, billName, category, subCategory, taxPercent, vatPercent, reductionPercent, isEquipment, isRecognized } = classifyDto;
    let transactions: Transactions[];
    // Add new user category if isNewCategory is true
    // if (isNewCategory) {
    //   try {
    //      // Align to CreateUserCategoryDto
    //      const categoryData: CreateUserCategoryDto = {
    //       categoryName: category,
    //       subCategoryName: subCategory,
    //       firebaseId: userId,
    //       taxPercent,
    //       vatPercent,
    //       reductionPercent,
    //       isEquipment,
    //       isRecognized,
    //       isExpense
    //     };
    //     await this.expenseService.addUserCategory(userId, categoryData);
    //   } catch (error) {
    //     if (error instanceof ConflictException) {
    //       console.log('Category already exists:', error.message);
    //     } else {
    //       throw error; // Re-throw other unexpected errors
    //     }
    //   }
    // }

    if (!isSingleUpdate) {
      transactions = await this.transactionsRepo.find({
        where: {
          userId,
          name,
          billName,
          //billDate: Between(startDate, endDate)
        },
      });
    } else {
      transactions = await this.transactionsRepo.find({
        where: {
          id,
          userId
        },
      });
    }

    transactions.forEach(transaction => {
      transaction.category = category;
      transaction.subCategory = subCategory;
      transaction.taxPercent = taxPercent;
      transaction.vatPercent = vatPercent;
      transaction.reductionPercent = reductionPercent;
      transaction.isEquipment = isEquipment;
      transaction.isRecognized = isRecognized;
    });

    await this.transactionsRepo.save(transactions);

    // Update ClassifiedTransactions only if it's not a single update
    if (!isSingleUpdate) {
      let classifiedTransaction = await this.classifiedTransactionsRepo.findOne({ where: { userId, transactionName: name, billName } });

      if (!classifiedTransaction) {
        classifiedTransaction = this.classifiedTransactionsRepo.create({
          userId,
          transactionName: name,
          billName,
          category,
          subCategory,
          taxPercent,
          vatPercent,
          reductionPercent,
          isEquipment,
          isRecognized
        });
      } else {
        classifiedTransaction.category = category;
        classifiedTransaction.subCategory = subCategory;
        classifiedTransaction.taxPercent = taxPercent;
        classifiedTransaction.vatPercent = vatPercent;
        classifiedTransaction.reductionPercent = reductionPercent;
        classifiedTransaction.isEquipment = isEquipment;
        classifiedTransaction.isRecognized = isRecognized;
      }

      await this.classifiedTransactionsRepo.save(classifiedTransaction);
    }
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
      businessNumber
    } = updateDto;

    let transactions: Transactions[];

    // Fetch the relevant transactions based on isSingleUpdate flag
    if (isSingleUpdate) {
      // Update only the specific transaction
      transactions = await this.transactionsRepo.find({
        where: {
          id,
          userId
        },
      });
    } else {
      // Update all transactions with the same name and billName within the specified date range
      transactions = await this.transactionsRepo.find({
        where: {
          userId,
          name: updateDto.name,
          billName: updateDto.billName,
          //billDate: Between(startDate, endDate)
        },
      });
    }

    // Update the specified fields in each transaction
    transactions.forEach(transaction => {
      transaction.category = category;
      transaction.subCategory = subCategory;
      transaction.isRecognized = isRecognized;
      transaction.vatPercent = vatPercent;
      transaction.taxPercent = taxPercent;
      transaction.isEquipment = isEquipment;
      transaction.reductionPercent = reductionPercent;
      transaction.businessNumber = businessNumber;
    });

    // Save the updated transactions
    await this.transactionsRepo.save(transactions);
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

    const bill = await this.billRepo.findOne({ where: { id: billId, userId }, relations: ['sources'] });
    if (!bill) {
      throw new Error('Bill not found');
    }

    console.log("bill is ", bill);

    // Create and save the new source
    const newSource = this.sourceRepo.create({
      userId,
      sourceName,
      sourceType,  // Assuming sourceType is a valid column in your Source entity
      bill
    });
    await this.sourceRepo.save(newSource);

    // Update the billName in all transactions of the user with the new source
    await this.updateBillNameInTransactions(sourceName, bill.billName, userId);

    return newSource;
  }


  private async updateBillNameInTransactions(sourceName: string, billName: string, userId: string): Promise<void> {
    const businessNumber = await this.getBusinessNumberByBillName(userId, billName);
    await this.transactionsRepo.update(
      { userId, paymentIdentifier: sourceName },
      { billName, businessNumber }
    );
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


  // New function to get transactions by string[].
  async getTransactionsByBillAndUserId(userId: string, startDate: Date, endDate: Date, billIds: string[] | null, categories: string[] | null): Promise<Transactions[]> {

    let sources: string[] = [];
    let allIdentifiers: string[] = [];

    // Step 1: Handle the 'ALL_BILLS' case (billIds is null)
    const allBills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });

    if (!billIds) {
      // Collect all sources from the user's bills
      allBills.forEach(bill => {
        if (bill.sources) {
          bill.sources.forEach(source => {
            sources.push(source.sourceName);
          });
        }
      });
    } else {
      // Step 2: Handle specific billIds
      const billIdNums = billIds.map(id => parseInt(id, 10));
      const selectedBills = allBills.filter(bill => billIdNums.includes(bill.id));
      selectedBills.forEach(bill => {
        if (bill.sources) {
          sources.push(...bill.sources.map(source => source.sourceName));
        }
      });
    }

    // Step 3: Collect all identifiers from all bills (used in NOT IN clause)
    allBills.forEach(bill => {
      allIdentifiers.push(...bill.sources.map(source => source.sourceName));
    });


    // Step 4: Build the transaction query
    const queryBuilder = this.transactionsRepo.createQueryBuilder('transaction');
    queryBuilder.where('transaction.userId = :userId', { userId });

    if (sources.length > 0 || allIdentifiers.length > 0) {
      queryBuilder.andWhere(
        new Brackets(qb => {
          qb.where(`transaction.paymentIdentifier IN (:...sources)`)
            .orWhere(`transaction.paymentIdentifier NOT IN (:...allIdentifiers)`)
            .orWhere(`transaction.paymentIdentifier IS NULL`);
        }),
        {
          sources: sources.length > 0 ? sources : [],
          allIdentifiers: allIdentifiers.length > 0 ? allIdentifiers : []
        }
      );
    }

    const defaultCategories = await this.categoryRepo.find();
    const userCategories = await this.userCategoryRepo.find({ where: { firebaseId: userId } });

    const allCategoriesName: string[] = [
      ...defaultCategories.map(c => c.categoryName),
      ...userCategories.map(c => c.categoryName),
    ];

    // Add category filter
    if (categories && categories.length > 0 && allCategoriesName.length > 0) {
      queryBuilder.andWhere(
        new Brackets(qb => {
          qb.where(`transaction.category IN (:...categories)`)
            .orWhere(`transaction.category NOT IN (:...allCategoriesName)`)
            .orWhere(`transaction.category IS NULL`);
        }),
        {
          categories,
          allCategoriesName,
        }
      );
    }

    queryBuilder.andWhere('DATE(transaction.billDate) BETWEEN :startDate AND :endDate', {
      startDate: startDate,
      endDate: endDate,
    });

    queryBuilder.orderBy('transaction.billDate', 'DESC');

    const transactions = await queryBuilder.getMany();
    return transactions;
  }

  // async getTransactionsByBillAndUserId(userId: string, startDate: Date, endDate: Date, billIds: string[]): Promise<Transactions[]> {
  //   let sources: string[] = [];
  //   let allIdentifiers: string[] = [];

  //   if (billId === null) {  // TODO: I changed this to null from "ALL_BILLS", for allow all bills in vatReport
  //     const bills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
  //     // Collect all sources from the user's bills
  //     if (bills.length > 0)  {
  //       bills.forEach(bill => {
  //         if (bill.sources) {
  //           bill.sources.forEach(source => {
  //             sources.push(source.sourceName);
  //           });
  //         }
  //       });
  //     }
  //   }
  //    else {
  //     // Get the specific bill for the user
  //     const billIdNum = parseInt(billId[0], 10);
  //     const bill = await this.billRepo.findOne({ where: { id: billIdNum, userId }, relations: ['sources'] });
  //     if (!bill) {
  //       throw new Error('Bill not found');
  //     }
  //     sources = bill.sources.map(source => source.sourceName);
  //   }

  //   // Get all paymentIdentifiers for all bills
  //   const allBills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
  //   allBills.forEach(bill => {
  //     allIdentifiers.push(...bill.sources.map(source => source.sourceName));
  //   });

  //   const queryBuilder = this.transactionsRepo.createQueryBuilder('transaction');
  //   queryBuilder.where('transaction.userId = :userId', { userId });
  //   if (sources.length > 0 || allIdentifiers.length > 0) {
  //     queryBuilder.andWhere(
  //       `(transaction.paymentIdentifier IN (:...sources) OR transaction.paymentIdentifier NOT IN (:...allIdentifiers))`,
  //       { sources: sources.length > 0 ? sources : [], allIdentifiers: allIdentifiers.length > 0 ? allIdentifiers : [] }
  //     );
  //   }
  //   queryBuilder.andWhere('DATE(transaction.billDate) BETWEEN :startDate AND :endDate', {
  //     startDate: startDate,
  //     endDate: endDate,
  //   });

  //   // Add ordering by billDate (ascending)
  //   queryBuilder.orderBy('transaction.billDate', 'DESC');

  //   const transactions = await queryBuilder.getMany();

  //   return transactions;

  // }


  async getIncomesTransactions(userId: string, startDate: Date, endDate: Date, billId: string[] | null, categories: string[] | null): Promise<Transactions[]> {

    const transactions = await this.getTransactionsByBillAndUserId(userId, startDate, endDate, billId, categories);
    //console.log("Transactions:\n", transactions)
    const incomeTransactions = transactions.filter(transaction => transaction.sum > 0);
    //console.log("incomeTransactions:\n", incomeTransactions)
    return incomeTransactions;

  }


  async getExpensesTransactions(userId: string, startDate: Date, endDate: Date, billId: string[] | null, categories: string[] | null): Promise<Transactions[]> {
    console.log("🚀 ~ TransactionsService ~ getExpensesTransactions ~ billId:", billId)

    const transactions = await this.getTransactionsByBillAndUserId(userId, startDate, endDate, billId, categories);
    //console.log("Transactions:\n", transactions)
    const expenseTransactions = transactions.filter(transaction => transaction.sum < 0);
    //console.log("expenseTransactions:\n", expenseTransactions)
    return expenseTransactions;

  }


  async getTaxableIncomefromTransactions(userId: string, businessNumber: string, startDate: Date, endDate: Date): Promise<number> {

    const incomeTransactions = await this.getIncomesTransactions(userId, startDate, endDate, null, null);

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
    const incomeTransactions = await this.getIncomesTransactions(userId, startDate, endDate, null, null);

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



  // async getExpensesToBuildReport(
    async getTransactionToConfirmAndAddToExpenses(
    userId: string,
    businessNumber: string,
    startDate: Date,
    endDate: Date
  ): Promise<Transactions[]> {

    console.log("userId is ", userId);
    console.log("businessNumber is ", businessNumber);

    const expenses = await this.transactionsRepo.find({
      where: [
        {
          userId,
          billDate: Between(startDate, endDate),
          isRecognized: true,
          sum: LessThan(0),
          businessNumber: businessNumber
        },
      ]
    });

    console.log("expenses are ", expenses);


    return expenses;

    //TODO: need to add here the expenses that were not reported yet but they in the range of the last half year.
  }


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


  async saveTransactionsToExpenses(transactionData: { id: number, file: string | null }[], userId: string): Promise<{ message: string }> {

    console.log("saveTransactionsToExpenses - start");

    const user = await this.userRepo.findOne({ where: { firebaseId: userId } });

    // Extract IDs from the transactionData array
    const transactionIds = transactionData.map(td => td.id);

    // Fetch transactions with the given IDs and matching userId
    const transactions = await this.transactionsRepo.findBy({
      id: In(transactionIds),
      userId: userId  // Ensuring that only transactions belonging to the user are fetched
    });

    if (!transactions || transactions.length === 0) {
      throw new Error('No transactions found with the provided IDs.');
    }

    const expenses: Expense[] = [];
    let skippedTransactions = 0;

    for (const transaction of transactions) {

      if (transaction.userId !== userId) {
        throw new Error(`Error: Transaction with ID ${transaction.id} does not belong to the user.`);
      }

      // Find the corresponding file from the input data
      const transactionFile = transactionData.find(td => td.id === transaction.id)?.file || '';

      // Check if an expense with the same date, supplier, and sum already exists
      const existingExpense = await this.expenseRepo.findOne({
        where: {
          userId: transaction.userId,
          date: transaction.billDate,
          supplier: transaction.name,
          sum: Math.abs(transaction.sum)
        }
      });

      console.log("existingExpense is ", existingExpense);

      if (existingExpense) {
        skippedTransactions++;
        continue;
      }

      const expense = new Expense();
      expense.supplier = transaction.name;
      expense.supplierID = '';
      expense.category = transaction.category;
      expense.subCategory = transaction.subCategory;
      expense.sum = Math.abs(transaction.sum);
      expense.taxPercent = transaction.taxPercent;
      expense.vatPercent = transaction.vatPercent;
      expense.date = transaction.billDate;
      expense.vatReportingDate = this.sharedService.getVATReportingDate(new Date(expense.date), user.vatReportingType);
      expense.note = '';
      expense.file = transactionFile;
      expense.isEquipment = transaction.isEquipment;
      expense.userId = transaction.userId;
      expense.loadingDate = new Date();
      expense.expenseNumber = '';
      expense.transId = transaction.id;
      expense.reductionPercent = transaction.reductionPercent;
      expense.businessNumber = transaction.businessNumber;

      // Retrieve the correct VAT rate based on the expense year
      const vatRate = this.sharedService.getVatRateByYear(new Date(expense.date));
      expense.totalVatPayable = (expense.sum / (1 + vatRate)) * vatRate * (expense.vatPercent / 100);
      expense.totalTaxPayable = (expense.sum - expense.totalVatPayable) * (expense.taxPercent / 100);

      // Determine the last year for expense reduction
      const purchaseYear = new Date(expense.date).getFullYear();
      const purchaseMonth = new Date(expense.date).getMonth() + 1;

      if (expense.reductionPercent) {
        const fullReductionYears = Math.ceil(100 / expense.reductionPercent);
        const isPartialYear = purchaseMonth > 1 || new Date(expense.date).getDate() > 1;
        expense.reductionDone = purchaseYear + fullReductionYears + (isPartialYear ? 1 : 0) - 1;
      } else {
        expense.reductionDone = 0;
      }

      // Save the updated transaction
      transaction.vatReportingDate = expense.vatReportingDate;
      await this.transactionsRepo.save(transaction);

      expenses.push(expense);
    }

    // Save new expenses to the database
    if (expenses.length > 0) {
      await this.expenseRepo.save(expenses);
    }

    const message = `Successfully converted ${expenses.length} transactions to expenses. ${skippedTransactions} transactions were skipped because they already exist as expenses.`;

    return { message };

  }


}
