import { Injectable, BadRequestException, NotFoundException, HttpException, HttpStatus, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, Not } from 'typeorm';
import * as XLSX from 'xlsx';
import { Express } from 'express'; 




//Entities
import { Transactions } from './transactions.entity';
import { Bill } from './bill.entity';
import { Source } from './source.entity';
import { ClassifiedTransactions } from './classified-transactions.entity';
import { ExpensesService } from '../expenses/expenses.service';
import { Expense } from '../expenses/expenses.entity';

//Services
import { SharedService } from '../shared/shared.service';

//DTOs
import { UpdateTransactionsDto } from './dtos/update-transactions.dto';
import { ClassifyTransactionDto } from './dtos/classify-transaction.dto';
import { Category } from '../expenses/categories.entity';
import { DefaultSubCategory } from '../expenses/default-sub-categories.entity';
import { CreateUserCategoryDto } from '../expenses/dtos/create-user-category.dto';
import { log } from 'console';


@Injectable()
export class TransactionsService {
  constructor(
    private readonly sharedService: SharedService,
    private readonly expenseService: ExpensesService,
    @InjectRepository(Transactions)
    private transactionsRepo: Repository<Transactions>,
    @InjectRepository(ClassifiedTransactions)
    private classifiedTransactionsRepo: Repository<ClassifiedTransactions>,
    @InjectRepository(Bill)
    private billRepo: Repository<Bill>,
    @InjectRepository(Source)
    private sourceRepo: Repository<Source>,
    @InjectRepository(Expense)
    private expenseRepo: Repository<Expense>,
    @InjectRepository(Category)
    private categoryRepo: Repository<Category>,
    @InjectRepository(DefaultSubCategory)
    private defaultSubCategoryRepo: Repository<DefaultSubCategory>
  ) {}

  async saveTransactions(file: Express.Multer.File, userId: string): Promise<{ message: string }> { // משתמש ב-Express.Multer.File

    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }); // Get rows as arrays of values, raw: false to get formatted strings

    // Assuming the first row contains headers
    const headers = rows.shift();    

    // Find index of each column based on header row
    const nameIndex = headers.findIndex(header => header === 'שם העסק');
    const paymentIdentifierIndex = headers.findIndex(header => header === 'אמצעי זיהוי התשלום');
    const billDateIndex = headers.findIndex(header => header === 'תאריך החיוב בחשבון');
    const payDateIndex = headers.findIndex(header => header === 'תאריך התשלום');
    const sumIndex = headers.findIndex(header => header === 'סכום');

    const classifiedTransactions = await this.classifiedTransactionsRepo.find({ where: { userId } });
    
    // Fetch user's bills and create a mapping from paymentIdentifier to billName
    const userBills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
    const paymentIdentifierToBillName = new Map<string, string>();

    userBills.forEach(bill => {
      bill.sources.forEach(source => {
        paymentIdentifierToBillName.set(source.sourceName, bill.billName);
      });
    });

    let skippedTransactions = 0;    

    for (const row of rows) {          
      const transaction = new Transactions();
      transaction.name = row[nameIndex];
      transaction.paymentIdentifier = row[paymentIdentifierIndex];
      const billDate = this.sharedService.convertDateStrToTimestamp(row[billDateIndex]);
      const payDate = this.sharedService.convertDateStrToTimestamp(row[payDateIndex]);
      transaction.billDate = billDate;
      transaction.payDate = payDate;
      transaction.monthReport = this.sharedService.getMonthFromTimestamp(transaction.payDate);
      transaction.sum = parseFloat(row[sumIndex]);
      transaction.userId = userId;

      // Check if a transaction with the same name, paymentIdentifier, billDate, sum, and userId already exists
      const existingTransaction = await this.transactionsRepo.findOne({
        where: {
          name: transaction.name,
          paymentIdentifier: transaction.paymentIdentifier,
          payDate: transaction.payDate,
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
      }
  
      // Check if there's a matching classified transaction
      const matchingClassifiedTransaction = classifiedTransactions.find(ct => ct.transactionName === transaction.name && ct.billName === transaction.paymentIdentifier);
      // If a match is found, update the transaction fields with the classified values
      if (matchingClassifiedTransaction) {
        transaction.category = matchingClassifiedTransaction.category;
        transaction.subCategory = matchingClassifiedTransaction.subCategory;
        transaction.isRecognized = matchingClassifiedTransaction.isRecognized;
        transaction.vatPercent = matchingClassifiedTransaction.vatPercent;
        transaction.taxPercent = matchingClassifiedTransaction.taxPercent;
        transaction.isEquipment = matchingClassifiedTransaction.isEquipment;
        transaction.reductionPercent = matchingClassifiedTransaction.reductionPercent;
      }
  
      await this.transactionsRepo.save(transaction);
    }


    console.log("Successfully saved = ", rows.length - skippedTransactions);
    console.log("skippedTransactions = ", skippedTransactions);
    console.log("Loading transaction done");

    return { message: `Successfully saved ${rows.length - skippedTransactions} transactions to the database. Skipped ${skippedTransactions} duplicate transactions.` };

  }


  async loadDefaultCategories(file: Express.Multer.File): Promise<{ message: string }> {
    
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }); // Get rows as arrays of values, raw: false to get formatted strings

    console.log("Extracted rows:", rows.slice(0, 5));

    // Assuming the first row contains headers
    const headers = rows.shift();
    console.log("header is ",headers);

    // Dynamically find the index of each column based on the header names
    const categoryIndex = headers.findIndex(header => header === 'category');
    const subCategoryIndex = headers.findIndex(header => header === 'subCategory');
    const categoryIdIndex = headers.findIndex(header => header === 'categoryId');
    const taxPercentIndex = headers.findIndex(header => header === 'taxPercent');
    const vatPercentIndex = headers.findIndex(header => header === 'vatPercent');
    const reductionPercentIndex = headers.findIndex(header => header === 'reductionPercent');
    const isEquipmentIndex = headers.findIndex(header => header === 'isEquipment');
    const isRecognizedIndex = headers.findIndex(header => header === 'isRecognized');


  for (const row of rows) {
    const categoryName = row[categoryIndex];
    const subCategoryName = row[subCategoryIndex];
    const categoryId = row[categoryIdIndex];
    const taxPercent = parseFloat(row[taxPercentIndex]);
    const vatPercent = parseFloat(row[vatPercentIndex]);
    const reductionPercent = parseFloat(row[reductionPercentIndex]);
    const isEquipment = row[isEquipmentIndex] == '1' || row[isEquipmentIndex] == 'true';  // Boolean conversion
    const isRecognized = row[isRecognizedIndex] == '1' || row[isRecognizedIndex] == 'true'; // Boolean conversion

    // Check if the category already exists
    let category = await this.categoryRepo.findOne({ where: { category: categoryName, id: categoryId } });
    if (!category) {
      // Create a new category if it doesn't exist
      category = this.categoryRepo.create({
        category: categoryName,
        id: categoryId,
        isDefault: true,
        firebaseId: null,
      });
      await this.categoryRepo.save(category);
    }

    // Create the sub-category
    const subCategory = new DefaultSubCategory();
    subCategory.subCategory = subCategoryName;
    subCategory.taxPercent = taxPercent;
    subCategory.vatPercent = vatPercent;
    subCategory.reductionPercent = reductionPercent;
    subCategory.isEquipment = isEquipment;
    subCategory.isRecognized = isRecognized;
    subCategory.category = category;

    await this.defaultSubCategoryRepo.save(subCategory);

  }

  return { message: `Successfully saved categories and sub-categories.` };

  }


  async getTransactionsByUserID (userId: string) {
    return await this.transactionsRepo.find({ where: { userId: userId } });
  }


  async classifyTransaction(classifyDto: ClassifyTransactionDto, userId: string, startDate: number, endDate: number): Promise<void> {

    const {id, isSingleUpdate, isNewCategory, name, billName, category, subCategory, taxPercent, vatPercent, reductionPercent, isEquipment, isRecognized} = classifyDto;
    let transactions: Transactions[];

    // Add new user category if isNewCategory is true
    if (isNewCategory) {
      try {
         // Align to CreateUserCategoryDto
         const categoryData: CreateUserCategoryDto = {
          categoryName: category,
          subCategoryName: subCategory,
          taxPercent,
          vatPercent,
          reductionPercent,
          isEquipment,
          isRecognized
        };
        await this.expenseService.addUserCategory(userId, categoryData);
      } catch (error) {
        if (error instanceof ConflictException) {
          console.log('Category already exists:', error.message);
        } else {
          throw error; // Re-throw other unexpected errors
        }
      }
    }
  
    if (!isSingleUpdate) {
      transactions = await this.transactionsRepo.find({
        where: {
          userId,
          name,
          billName,
          payDate: Between(startDate, endDate)
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


  async updateTransaction(updateDto: UpdateTransactionsDto, userId: string, startDate: number, endDate: number): Promise<void> {
    const {
      id,
      isSingleUpdate,
      category,
      subCategory,
      isRecognized,
      vatPercent,
      taxPercent,
      isEquipment,
      reductionPercent
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
          payDate: Between(startDate, endDate)
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
    });
  
    // Save the updated transactions
    await this.transactionsRepo.save(transactions);
  }  


  ///////////////////////////////////////////////////////////////////////////////////////////////
  /////////////////////////////               Bills                 /////////////////////////////
  ///////////////////////////////////////////////////////////////////////////////////////////////

  async addBill(userId: string, billName: string){
    const isAlreadyExist = await this.billRepo.findOne({ where: {userId: userId, billName: billName} });
    if (isAlreadyExist) {
        throw new HttpException({
            status: HttpStatus.CONFLICT,
            error: `Bill with this name: "${name}" already exists`
        }, HttpStatus.CONFLICT);
    }
    const bill = this.billRepo.create({userId, billName });
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


  async addSourceToBill(billId: number, sourceName: string, userId: string): Promise<Source> {
    const bill = await this.billRepo.findOne({ where: { id: billId, userId }, relations: ['sources'] });
    if (!bill) {
      throw new Error('Bill not found');
    }

    // Create and save the new source
    const newSource = this.sourceRepo.create({ sourceName, bill });
    await this.sourceRepo.save(newSource);

    // Update the billName in all transactions of the user with the new source
    await this.updateBillNameInTransactions(sourceName, bill.billName, userId);

    return newSource;
  }


  private async updateBillNameInTransactions(sourceName: string, billName: string, userId: string): Promise<void> {
    await this.transactionsRepo.update(
      { userId, paymentIdentifier: sourceName },
      { billName }
    );
  }


  async getBillsByUserId(userId: string): Promise<Bill[]> {

    console.log("getBillsByUserId - start");
    

    const bills = await this.billRepo.find({
      where: { userId: userId}
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
  

  async getTransactionsByBillAndUserId(billId: string, userId: string, startDate: number, endDate: number): Promise<Transactions[]> {

    let sources: string[] = [];
    let allIdentifiers: string[] = [];

    if (billId === "ALL_BILLS") {  
      const bills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
      if (!bills || bills.length === 0) {
      }
      // Collect all sources from the user's bills
      if (bills.length > 0)  {
        bills.forEach(bill => {
          if (!bill.sources) {
            // console.log("Bill has no sources:", JSON.stringify(bill, null, 2));
          } else {
            bill.sources.forEach(source => {
              sources.push(source.sourceName);
            });
          }
        });
      }
      // If there are no sources, return all transactions within the date range
      if (sources.length === 0) {
        return await this.transactionsRepo.find({
          where: {
            userId,
            payDate: Between(startDate, endDate)
          }
        });
      }
    } else {
      // Get the specific bill for the user
      const billIdNum = parseInt(billId, 10);
      const bill = await this.billRepo.findOne({ where: { id: billIdNum, userId }, relations: ['sources'] });
      if (!bill) {
        throw new Error('Bill not found');
      }
      sources = bill.sources.map(source => source.sourceName);
    }

     // Get all paymentIdentifiers for all bills
     const allBills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
     allBills.forEach(bill => {
       allIdentifiers.push(...bill.sources.map(source => source.sourceName));
     });


    const transactions = await this.transactionsRepo.find({
    where: [
      {
        userId,
        paymentIdentifier: In(sources),
        payDate: Between(startDate, endDate)
      },
      {
        userId,
        paymentIdentifier: Not(In(allIdentifiers)),
        payDate: Between(startDate, endDate)
      }
    ]
  });

  return transactions;

  }


  async getIncomesTransactions(query: any): Promise<Transactions[]> {

    const transactions = await this.getTransactionsByBillAndUserId(query.billId, query.userId, query.startDate, query.endDate);
    //console.log("Transactions:\n", transactions)
    const incomeTransactions = transactions.filter(transaction => transaction.sum > 0);
    //console.log("incomeTransactions:\n", incomeTransactions)
    return incomeTransactions;

  }


  async getExpensesTransactions(query: any): Promise<Transactions[]> {
    
    const transactions = await this.getTransactionsByBillAndUserId(query.billId, query.userId, query.startDate, query.endDate);
    //console.log("Transactions:\n", transactions)
    const expenseTransactions = transactions.filter(transaction => transaction.sum < 0);
    //console.log("expenseTransactions:\n", expenseTransactions)
    return expenseTransactions;

  }


  async getTransactionsToBuildReport(
    userId: string,
    startDate: number,
    endDate: number,
  ): Promise<Transactions[]> {
  
    const sixMonthsInMilliseconds = 6 * 30 * 24 * 60 * 60 * 1000;

    return await this.transactionsRepo
      .createQueryBuilder('transactions')
        .where(
          'transactions.userId = :userId', { userId }
        )
        // Condition 1: (startDate <= payDate <= endDate) and isRecognized = true
        .andWhere(
          '(transactions.payDate BETWEEN :startDate AND :endDate AND transactions.isRecognized = true)', { startDate, endDate }
        )
        // Condition 2: (payDate is max half year before startDate) and monthReport = null
        .orWhere(
          '(transactions.payDate < :startDate AND transactions.payDate >= :halfYearBeforeStartDate AND transactions.monthReport IS NULL)',
          { startDate, halfYearBeforeStartDate: startDate - sixMonthsInMilliseconds }
        )
    .getMany();
  }


  async saveTransactionsToExpenses(transactionData: { id: number, file: string | null }[], userId: string): Promise<{ message: string }> {

    console.log("id is ", transactionData[0].id);
    console.log("file is ", transactionData[0].file);
    

    // Extract IDs from the transactionData array
    const transactionIds = transactionData.map(td => td.id);

    // Fetch transactions with the given IDs
    const transactions = await this.transactionsRepo.findBy({ id: In(transactionIds) });
  
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
          dateTimestamp: transaction.payDate,
          supplier: transaction.name,
          sum: Math.abs(transaction.sum)
        }
      });
  
      if (existingExpense) {
        // console.log(`Transaction with ID ${transaction.id} already exists as an expense.`);
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
      expense.dateTimestamp = transaction.payDate;
      expense.monthReport = this.sharedService.getMonthFromTimestamp(transaction.payDate);
      expense.note = '';
      expense.file = transactionFile;
      expense.isEquipment = transaction.isEquipment;
      expense.userId = transaction.userId;
      expense.loadingDate = Date.now();
      expense.expenseNumber = '';
      expense.transId = transaction.id;
      expense.reductionDone = false;
      expense.reductionPercent = transaction.reductionPercent;
      
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
