import { Injectable, BadRequestException, NotFoundException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between, Not } from 'typeorm';
import * as XLSX from 'xlsx';

//Entities
import { Transactions } from './transactions.entity';
import { Bill } from './bill.entity';
import { Source } from './source.entity';
import { ClassifiedTransactions } from './classified-transactions.entity';
import { ExpensesService } from 'src/expenses/expenses.service';

//Services
import { SharedService } from 'src/shared/shared.service';

//DTOs
import { UpdateTransactionsDto } from './dtos/update-transactions.dto';
import { ClassifyTransactionDto } from './dtos/classify-transaction.dto';
import { UpdateNewTransactionDto } from './dtos/update-new-transaction.dto';


@Injectable()
export class TransactionsService {
  constructor(
    private readonly sharedService: SharedService,
    //private readonly expenseService: ExpensesService,
    @InjectRepository(Transactions)
    private transactionsRepo: Repository<Transactions>,
    @InjectRepository(Transactions)
    private classifiedTransactionsRepo: Repository<ClassifiedTransactions>,
    @InjectRepository(Bill)
    private billRepo: Repository<Bill>,
    @InjectRepository(Source)
    private sourceRepo: Repository<Source>,
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

    return { message: `Successfully saved ${rows.length} transactions to the database.` };
  }


  async getTransactionsByUserID (userId: string) {
    return await this.transactionsRepo.find({ where: { userId: userId } });
  }


  async classifyTransaction(classifyDto: UpdateNewTransactionDto, userId: string, startDate: number, endDate: number): Promise<void> {

    const { id, isSingleUpdate, name, billName, ...updateFields } = classifyDto;

    let transactions: Transactions[];

    if (!classifyDto.isSingleUpdate) {
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
      for (const key in updateFields) {
        transaction[key] = updateFields[key];
      }
    });

    await this.transactionsRepo.save(transactions);

    // Save classification rule to ClassifiedTransactions
    let classifiedTransaction = await this.classifiedTransactionsRepo.findOne({ where: { userId, transactionName: name, billName } });

    if (!classifiedTransaction) {
      classifiedTransaction = this.classifiedTransactionsRepo.create({
        userId,
        transactionName: name,
        billName,
        ...updateFields
      });
    } else {
      for (const key in updateFields) {
        classifiedTransaction[key] = updateFields[key];
      }
    }
   
    await this.classifiedTransactionsRepo.save(classifiedTransaction);

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
      // Get all bills for the user
      console.log("ALL_BILLS");
      console.log("billId is ", billId);
      
      const bills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
      console.log("bills are ", JSON.stringify(bills, null, 2));

      //console.log("bills are ", bills);
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
          //if (source === undefined) {
          //  console.error("Sources array is undefined before pushing!");
          //}
          sources.push(source.sourceName);
          console.log("Sources array after pushing:", sources);
        });
        console.log("Bill sources after pushing:", sources);
      }
    });

    // Collect all paymentIdentifiers from all bills
    allIdentifiers = sources;

    } else {
      // Get the specific bill for the user
      const billIdNum = parseInt(billId, 10);
      const bill = await this.billRepo.findOne({ where: { id: billIdNum, userId }, relations: ['sources'] });
      console.log("bill is ", bill);
      if (!bill) {
        throw new Error('Bill not found');
      }

      sources = bill.sources.map(source => source.sourceName);
    }

    console.log("sources are ", sources);

     // Get all paymentIdentifiers for all bills
     const allBills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
     allBills.forEach(bill => {
       allIdentifiers.push(...bill.sources.map(source => source.sourceName));
     });

     console.log("allIdentifiers is ", allIdentifiers);
     

    // Find transactions that match the criteria
    const transactions = await this.transactionsRepo.find({
    where: [
      {
        userId,
        paymentIdentifier: In(sources),
        // billDate: Between(startDate, endDate)
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

    console.log("billId is ", query.billId);
    console.log("Type of billId is ", typeof query.billId);
    
    const transactions = await this.getTransactionsByBillAndUserId(query.billId, query.userId, query.startDate, query.endDate);
    //console.log("Transactions:\n", transactions)
    const incomeTransactions = transactions.filter(transaction => transaction.sum > 0);
    console.log("incomeTransactions:\n", incomeTransactions)
    return incomeTransactions;

  }

  async getExpensesTransactions(query: any): Promise<Transactions[]> {

    console.log("getExpensesTransactions - start");

    console.log("billId is ", query.billId);
    console.log("Type of billId is ", typeof query.billId);
    
    const transactions = await this.getTransactionsByBillAndUserId(query.billId, query.userId, query.startDate, query.endDate);
    //console.log("Transactions:\n", transactions)
    const expenseTransactions = transactions.filter(transaction => transaction.sum < 0);
    console.log("expenseTransactions:\n", expenseTransactions)
    return expenseTransactions;

  }


  async updateTransactionsByCriteria(
    startDate: number,
    endDate: number,
    updateData: UpdateTransactionsDto,
  ): Promise<void> {
    // Find transactions matching the criteria
    const transactions = await this.transactionsRepo.find({
      where: {
        name: updateData.name,
        paymentIdentifier: updateData.paymentIdentifier,
        billDate: Between(startDate, endDate),
      },
    });

    if (transactions.length === 0) {
      throw new Error('No transactions found matching the criteria');
    }

    // Update each transaction with the provided data
    for (const transaction of transactions) {
      Object.assign(transaction, updateData);
      await this.transactionsRepo.save(transaction);
    }
  }


}
