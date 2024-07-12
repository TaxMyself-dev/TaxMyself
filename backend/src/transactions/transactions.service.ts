import { Injectable, BadRequestException, NotFoundException, HttpException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan, LessThan } from 'typeorm';
import * as XLSX from 'xlsx';
import { Transactions } from './transactions.entity';
import { parse, isValid } from 'date-fns';
import { DateTime } from 'luxon';
import { Bill } from './bill.entity';
import { Source } from './source.entity';
import { SharedService } from 'src/shared/shared.service';


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
      const billDate = this.convertStringToDate(row[billDateIndex]);
      const payDate = this.convertStringToDate(row[payDateIndex]);
      transaction.billDate = billDate;
      transaction.payDate = payDate;
      transaction.sum = parseFloat(row[sumIndex]);
      //transaction.category = row[categoryIndex];
      // transaction.userId should be set to the current user's ID somehow

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
    const newSource = this.sourceRepo.create({ sourceName, bill });
    return this.sourceRepo.save(newSource);
  }


  async getBillsByUserId(userId: string): Promise<Bill[]> {

    return this.billRepo.find({
      where: { userId: userId}
    });

    // const bills = await this.billRepo
    //   .createQueryBuilder('bill')
    //   .select(['bill.id', 'bill.billName'])
    //   .where('bill.userId = :userId', { userId })
    //   .getMany();

    // return bills.map(bill => ({ id: bill.id, billName: bill.billName }));
  }

  async getSources(userId: string): Promise<string[]> {
    let sources: string[] = [];

      // Get all bills for the user
      const bills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
      if (!bills || bills.length === 0) {
        throw new Error('No bills found for the user');
      }
      console.log("bills:", bills);
      
      bills.forEach(bill => {
        sources.push(...bill.sources.map(source => source.sourceName));
      });
      console.log("sources: ", sources);
      

    return sources;
  }

  async getTransactionsByBillAndUserId(billId: number, userId: string): Promise<Transactions[]> {

    let sources: string[] = [];

    if (billId === null) {
      // Get all bills for the user
      const bills = await this.billRepo.find({ where: { userId }, relations: ['sources'] });
      if (!bills || bills.length === 0) {
        throw new Error('No bills found for the user');
      }

      // Collect all sources from the user's bills
      bills.forEach(bill => {
        sources.push(...bill.sources.map(source => source.sourceName));
      });
    } else {
      // Get the specific bill for the user
      const bill = await this.billRepo.findOne({ where: { id: billId, userId }, relations: ['sources'] });
      if (!bill) {
        throw new Error('Bill not found');
      }

      sources = bill.sources.map(source => source.sourceName);
    }

    console.log("sources are ", sources);
    

    return this.transactionsRepo.find({
      where: { paymentIdentifier: In(sources) },
    });
  }


  async getIncomesTransactions(query: any): Promise<Transactions[]> {
    //const transactions = await this.sharedService.findEntities(Transactions, query);
    //console.log("getIncomesTransactions query is ", query);
    
    const transactions = await this.getTransactionsByBillAndUserId(query.billId, query.userId);
    //console.log(transactions);
    return transactions.filter(transaction => transaction.sum > 0);
  }


  async getExpensesTransactions(billId: number | null, userId: string): Promise<Transactions[]> {
    const transactions = await this.getTransactionsByBillAndUserId(billId, userId);
    //console.log(transactions);
    return transactions.filter(transaction => transaction.sum < 0);
  }


  //async updateTransactionFields() {
  //
  //}


}
