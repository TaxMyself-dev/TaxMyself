import { Injectable, BadRequestException, NotFoundException, HttpException, HttpStatus, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, Not, Brackets } from 'typeorm';
import * as XLSX from 'xlsx';
import { Express } from 'express'; 
import { SourceType, VATReportingType} from 'src/enum';

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
import { DefaultCategory } from '../expenses/default-categories.entity';
import { DefaultSubCategory } from '../expenses/default-sub-categories.entity';
import { CreateUserCategoryDto } from '../expenses/dtos/create-user-category.dto';
import { User } from 'src/users/user.entity';
import { UserCategory } from 'src/expenses/user-categories.entity';
import { CreateBillDto } from './dtos/create-bill.dto';


@Injectable()
export class TransactionsService {
  constructor(
    private readonly sharedService: SharedService,
    private readonly expenseService: ExpensesService,
    @InjectRepository(User)
    private userRepo: Repository<User>,
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
    @InjectRepository(DefaultCategory)
    private categoryRepo: Repository<DefaultCategory>,
    @InjectRepository(UserCategory)
    private userCategoryRepo: Repository<UserCategory>,
    @InjectRepository(DefaultSubCategory)
    private defaultSubCategoryRepo: Repository<DefaultSubCategory>
  ) {}

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
                
        console.log("save transaction: date is ", row[billDateIndex], ", type is ", typeof(row[billDateIndex]));
        transaction.billDate = this.sharedService.parseDateStringToDate(row[billDateIndex], "dd/MM/yyyy");
        
        //transaction.payDate = this.sharedService.parseDateStringToDate(row[payDateIndex], "dd/MM/yyyy");
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

      transactionsToSave.push(transaction);
      //await this.transactionsRepo.save(transaction);

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
    let category = await this.categoryRepo.findOne({ where: { categoryName: categoryName} });
    if (!category) {
      // Create a new category if it doesn't exist
      category = this.categoryRepo.create({
        categoryName: categoryName,
        isExpense: isExpense
      });
      await this.categoryRepo.save(category);
    }

    // Check if the sub-category already exists
    let subCategory = await this.defaultSubCategoryRepo.findOne({ where: { subCategoryName: subCategoryName}});
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


  async getTransactionsByUserID (userId: string) {
    return await this.transactionsRepo.find({ where: { userId: userId } });
  }


  async classifyTransaction(classifyDto: ClassifyTransactionDto, userId: string, startDate: Date, endDate: Date): Promise<void> {

    const {id, isSingleUpdate, isNewCategory, name, billName, category, subCategory, taxPercent, vatPercent, reductionPercent, isEquipment, isRecognized} = classifyDto;
    let transactions: Transactions[];

    // Add new user category if isNewCategory is true
    if (isNewCategory) {
      try {
         // Align to CreateUserCategoryDto
         const categoryData: CreateUserCategoryDto = {
          categoryName: category,
          subCategoryName: subCategory,
          firebaseId: userId,
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
          billDate: Between(startDate, endDate)
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
          billDate: Between(startDate, endDate)
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

  async addBill(userId: string, createBillDto: CreateBillDto){
    const isAlreadyExist = await this.billRepo.findOne({ where: {userId: userId, billName: createBillDto.billName} });
    if (isAlreadyExist) {
        throw new HttpException({
            status: HttpStatus.CONFLICT,
            error: `Bill with this name: "${createBillDto.billName}" already exists`
        }, HttpStatus.CONFLICT);
    }

    const bill = this.billRepo.create({
      userId: userId, 
      billName: createBillDto.billName,
      businessNumber: createBillDto.businessNumber });
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

    // Create and save the new source
    const newSource = this.sourceRepo.create({
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
    await this.transactionsRepo.update(
      { userId, paymentIdentifier: sourceName },
      { billName }
    );
  }


  async getBillsByUserId(userId: string): Promise<Bill[]> {

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
  

  async getTransactionsByBillAndUserId(userId: string, startDate: Date, endDate: Date, billId: string): Promise<Transactions[]> {

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
            billDate: Between(startDate, endDate)
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
        billDate: Between(startDate, endDate)
      },
      {
        userId,
        paymentIdentifier: Not(In(allIdentifiers)),
        billDate: Between(startDate, endDate)
      }
    ]
  });
  
  return transactions;

  }


  async getIncomesTransactions(userId: string, startDate: Date, endDate: Date, billId: string): Promise<Transactions[]> {

    const transactions = await this.getTransactionsByBillAndUserId(userId, startDate, endDate, billId);
    //console.log("Transactions:\n", transactions)
    const incomeTransactions = transactions.filter(transaction => transaction.sum > 0);
    //console.log("incomeTransactions:\n", incomeTransactions)
    return incomeTransactions;

  }


  async getExpensesTransactions(userId: string, startDate: Date, endDate: Date, billId: string): Promise<Transactions[]> {
    
    const transactions = await this.getTransactionsByBillAndUserId(userId, startDate, endDate, billId);
    //console.log("Transactions:\n", transactions)
    const expenseTransactions = transactions.filter(transaction => transaction.sum < 0);
    //console.log("expenseTransactions:\n", expenseTransactions)
    return expenseTransactions;

  }


  async getTaxableIncomefromTransactions(userId: string, startDate: Date, endDate: Date, billId: string): Promise<Number> {

    const incomeTransactions = await this.getIncomesTransactions(userId, startDate, endDate, billId);

    // Filter transactions classified as "הכנסה מעסק"
    const taxableIncomeTransactions = incomeTransactions.filter(transaction => 
      transaction.category === "הכנסה מעסק"
    );

    // Calculate the total income
    let totalBusinessIncome = 0;
    for (const transaction of taxableIncomeTransactions) {
      totalBusinessIncome += transaction.sum;
    }
    
    return totalBusinessIncome;

  }


  async getTransactionsToBuildReport(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<Transactions[]> {
  
    const sixMonthsInMilliseconds = 6 * 30 * 24 * 60 * 60 * 1000;
  
    return await this.transactionsRepo
      .createQueryBuilder('transactions')
        .where('transactions.userId = :userId', { userId })
        // Group the two conditions so they both apply to the same userId
        .andWhere(
          new Brackets(qb => {
            qb.where(
              '(transactions.billDate BETWEEN :startDate AND :endDate AND transactions.isRecognized = true)', 
              { startDate, endDate }
            )
            //TODO: Need to Add here the condition of half year back && isRecognized && not reported!!!
            // .orWhere(
            //   '(transactions.billDate < :startDate AND transactions.billDate >= :halfYearBeforeStartDate AND transactions.vatReportingDate IS NULL)', 
            //   { startDate, halfYearBeforeStartDate: startDate - sixMonthsInMilliseconds }
            // );
          })
        )
      .getMany();
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
      expense.reductionDone = false;
      expense.reductionPercent = transaction.reductionPercent;
      expense.businessNumber = transaction.businessNumber;

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
