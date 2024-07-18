import { Injectable, BadRequestException, NotFoundException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan, LessThan, Between, IsNull, Not } from 'typeorm';
import * as XLSX from 'xlsx';
import { Transactions } from './transactions.entity';
import { parse, isValid } from 'date-fns';
import { DateTime } from 'luxon';
import { Bill } from './bill.entity';
import { Source } from './source.entity';
import { SharedService } from 'src/shared/shared.service';
import { UpdateTransactionsDto } from './dtos/update-transactions.dto';


@Injectable()
export class TransactionsService {
  constructor(
    private readonly sharedService: SharedService,
    @InjectRepository(Transactions)
    private transactionsRepo: Repository<Transactions>,
    @InjectRepository(Bill)
    private billRepo: Repository<Bill>,
    @InjectRepository(Source)
    private sourceRepo: Repository<Source>,
  ) {}

  async saveTransactions(file: Express.Multer.File): Promise<{ message: string }> {
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
    //const categoryIndex = headers.findIndex(header => header === 'קטגוריה');

    for (const row of rows) {
      const transaction = new Transactions();
      transaction.name = row[nameIndex];
      transaction.paymentIdentifier = row[paymentIdentifierIndex];
      //convert string to date
      //const billDate = this.convertStringToDate(row[billDateIndex]);
      //const payDate = this.convertStringToDate(row[payDateIndex]);
      const billDate = this.sharedService.convertDateStrToTimestamp(row[billDateIndex]);
      const payDate = this.sharedService.convertDateStrToTimestamp(row[payDateIndex]);
      transaction.billDate = billDate;
      transaction.payDate = payDate;
      transaction.sum = parseFloat(row[sumIndex]);
      //transaction.category = row[categoryIndex];
      transaction.userId = "L5gJkrdQZ5gGmte5XxRgagkqpOL2"; //TODO: set to the current user's ID 

      //console.log("transaction_",row,":\n",transaction);

      await this.transactionsRepo.save(transaction);
    }

    return { message: `Successfully saved ${rows.length} transactions to the database.` };
  }


  convertStringToDate(inputString) {
    // Split the input string by '/'
    const parts = inputString.split('/');
  
    if (parts.length !== 3) {
      return null; // Invalid input format
    }
  
    const month = parseInt(parts[0], 10) - 1; // Subtract 1 as months are zero-based in JavaScript
    const day = parseInt(parts[1], 10);
    const year = parseInt(parts[2], 10) + 2000; // Assuming "yy" represents a year in 2000s
  
    // Create a new Date object
    const date = new Date(year, month, day);
  
    if (isNaN(date.getTime())) {
      return null; // Invalid date
    }
  
    return date;
  }

  async getTransactionsByUserID (userId: string) {
    return await this.transactionsRepo.find({ where: { userId: userId } });
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

  async getTransactionsByBillAndUserId(billId: number | null, userId: string, startDate: number, endDate: number): Promise<Transactions[]> {

    let sources: string[];
    let allIdentifiers: string[] = [];

    if (billId === null) {
      // Get all bills for the user
      const bills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
      console.log("bills are ", bills);
      if (!bills || bills.length === 0) {
        throw new Error('No bills found for the user');
      }

      // Collect all sources from the user's bills
      bills.forEach(bill => {
        sources.push(...bill.sources.map(source => source.sourceName));
      });

      // Collect all paymentIdentifiers from all bills
      allIdentifiers = sources;

    } else {
      // Get the specific bill for the user
      const bill = await this.billRepo.findOne({ where: { id: billId, userId }, relations: ['sources'] });
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

    // return this.transactionsRepo.find({
    //   where: { paymentIdentifier: In(sources),
    //            billDate: Between(startDate, endDate)
    //    },
    // });
  }


  async getIncomesTransactions(query: any): Promise<Transactions[]> {
    //const transactions = await this.sharedService.findEntities(Transactions, query);
    console.log("getIncomesTransactions query is ", query);

    console.log("billId is ", query.billId);
    console.log("Type of billId is ", typeof query.billId);
    
    const transactions = await this.getTransactionsByBillAndUserId(query.billId, query.userId, query.startDate, query.endDate);
    //console.log("Transactions:\n", transactions)
    const incomeTransactions = transactions.filter(transaction => transaction.sum > 0);
    console.log("incomeTransactions:\n", incomeTransactions)
    return incomeTransactions;

  }

  async getExpensesTransactions(query: any): Promise<Transactions[]> {
    //const transactions = await this.sharedService.findEntities(Transactions, query);
    console.log("getIncomesTransactions query is ", query);

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
