import { Injectable, BadRequestException, NotFoundException, HttpException, HttpStatus, UnauthorizedException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, Not } from 'typeorm';
import * as XLSX from 'xlsx';

//Entities
import { Transactions } from './transactions.entity';
import { Bill } from './bill.entity';
import { Source } from './source.entity';
import { ClassifiedTransactions } from './classified-transactions.entity';
import { ExpensesService } from 'src/expenses/expenses.service';
import { Expense } from 'src/expenses/expenses.entity';

//Services
import { SharedService } from 'src/shared/shared.service';

//DTOs
import { UpdateTransactionsDto } from './dtos/update-transactions.dto';
import { ClassifyTransactionDto } from './dtos/classify-transaction.dto';


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
  ) {}


  async saveTransactions(file: Express.Multer.File, userId: string): Promise<{ message: string }> {
    console.log("in save tran");
    
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
      console.log("in 1 for");
      
      const transaction = new Transactions();
      transaction.name = row[nameIndex];
      transaction.paymentIdentifier = row[paymentIdentifierIndex];
      const billDate = this.sharedService.convertDateStrToTimestamp(row[billDateIndex]);
      const payDate = this.sharedService.convertDateStrToTimestamp(row[payDateIndex]);
      transaction.billDate = billDate;
      transaction.payDate = payDate;
      transaction.sum = parseFloat(row[sumIndex]);
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
        console.log(`Transaction with name ${transaction.name}, paymentIdentifier ${transaction.paymentIdentifier}, billDate ${transaction.billDate}, and sum ${transaction.sum} already exists. Skipping.`);
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

    return { message: `Successfully saved ${rows.length - skippedTransactions} transactions to the database. Skipped ${skippedTransactions} duplicate transactions.` };

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
        const categoryData = {category, subCategory, taxPercent, vatPercent, reductionPercent, isEquipment, isRecognized};
        await this.expenseService.addUserCategory(categoryData, userId);
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

    return this.billRepo.find({
      where: { userId: userId}
    });

  }

  async getSources(userId: string): Promise<string[]> {
    let sources: string[] = [];

      // Get all bills for the user
      const bills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
      if (!bills || bills.length === 0) {
        throw new Error('No bills found for the user');
      }
      //console.log("bills:", bills);
      
      bills.forEach(bill => {
        sources.push(...bill.sources.map(source => source.sourceName));
      });
      //console.log("sources: ", sources);
      

    return sources;
  }

  async getTransactionsByBillAndUserId(billId: string, userId: string, startDate: number, endDate: number): Promise<Transactions[]> {

    let sources: string[] = [];
    let allIdentifiers: string[] = [];

    console.log("getTransactionsByBillAndUserId - start");


    if (billId === "ALL_BILLS") {  
      const bills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
      if (!bills || bills.length === 0) {
        throw new Error('No bills found for the user');
      }
      // Collect all sources from the user's bills
      bills.forEach(bill => {
      if (!bill.sources) {
        console.log("Bill has no sources:", JSON.stringify(bill, null, 2));
      } else {
        console.log("Bill sources before pushing:", bill.sources);
        bill.sources.forEach(source => {
          console.log("Source being pushed:", source.sourceName);
          sources.push(source.sourceName);
          console.log("Sources array after pushing:", sources);
        });
        console.log("Bill sources after pushing:", sources);
      }
    });
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


  async getIncomesTransactions(query: any): Promise<Transactions[]> {

    console.log("getIncomesTransactions - start ");

    const transactions = await this.getTransactionsByBillAndUserId(query.billId, query.userId, query.startDate, query.endDate);
    //console.log("Transactions:\n", transactions)
    const incomeTransactions = transactions.filter(transaction => transaction.sum > 0);
    //console.log("incomeTransactions:\n", incomeTransactions)
    return incomeTransactions;

  }


  async getExpensesTransactions(query: any): Promise<Transactions[]> {

    console.log("getExpensesTransactions - start");
    
    const transactions = await this.getTransactionsByBillAndUserId(query.billId, query.userId, query.startDate, query.endDate);
    //console.log("Transactions:\n", transactions)
    const expenseTransactions = transactions.filter(transaction => transaction.sum < 0);
    //console.log("expenseTransactions:\n", expenseTransactions)
    return expenseTransactions;

  }


  async saveTransactionsToExpenses(transactionIds: number[]): Promise<{ message: string }> {

    // Fetch transactions with the given IDs
    const transactions = await this.transactionsRepo.findBy({ id: In(transactionIds) });
  
    if (!transactions || transactions.length === 0) {
      throw new Error('No transactions found with the provided IDs.');
    }

    const expenses: Expense[] = [];
    let skippedTransactions = 0;

    for (const transaction of transactions) {
      // Check if an expense with the same date, supplier, and sum already exists
      const existingExpense = await this.expenseRepo.findOne({
        where: {
          dateTimestamp: transaction.billDate,
          supplier: transaction.name,
          sum: transaction.sum
        }
      });
  
      if (existingExpense) {
        console.log(`Transaction with ID ${transaction.id} already exists as an expense.`);
        skippedTransactions++;
        continue;
      }
  
      const expense = new Expense();
      expense.supplier = transaction.name;
      expense.supplierID = '';
      expense.category = transaction.category;
      expense.subCategory = transaction.subCategory;
      expense.sum = transaction.sum;
      expense.taxPercent = transaction.taxPercent;
      expense.vatPercent = transaction.vatPercent;
      expense.dateTimestamp = transaction.billDate;
      expense.note = '';
      expense.file = '';
      expense.isEquipment = transaction.isEquipment;
      expense.userId = transaction.userId;
      expense.loadingDate = Date.now();
      expense.expenseNumber = '';
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




  
    // const expense = transactions.map(transaction => {
    //   const expense = new Expense();
    //   expense.supplier = transaction.name;
    //   expense.supplierID = '';
    //   expense.category = transaction.category;
    //   expense.subCategory = transaction.subCategory;
    //   expense.sum = transaction.sum;
    //   expense.taxPercent = transaction.taxPercent;
    //   expense.vatPercent = transaction.vatPercent;
    //   expense.dateTimestamp = transaction.billDate;
    //   expense.note = '';
    //   expense.file = '';
    //   expense.isEquipment = transaction.isEquipment;
    //   expense.userId = transaction.userId;
    //   expense.loadingDate = Date.now();
    //   expense.expenseNumber = '';
    //   expense.reductionDone = false;
    //   expense.reductionPercent = transaction.reductionPercent;
    //   return expense;
    // });
  
    // // Save expenses to the database
    // await this.expenseRepo.save(expenses);
  
    // return { message: `Successfully converted ${expenses.length} transactions to expenses.` };
  }


}
