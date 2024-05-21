import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Transactions } from './transactions.entity';
import { parse, isValid } from 'date-fns';
import { DateTime } from 'luxon';


@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transactions)
    private transactionsRepository: Repository<Transactions>,
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
    const billDateIndex = headers.findIndex(header => header === 'תאריך חיוב');
    const payDateIndex = headers.findIndex(header => header === 'תאריך תשלום');
    const sumIndex = headers.findIndex(header => header === 'סכום');
    const categoryIndex = headers.findIndex(header => header === 'קטגוריה');

    for (const row of rows) {
      const transaction = new Transactions();
      transaction.name = row[nameIndex];
      //convert string to date
      const billDate = this.convertStringToDate(row[billDateIndex]);
      const payDate = this.convertStringToDate(row[payDateIndex]);
      transaction.billDate = billDate;
      transaction.payDate = payDate;
      transaction.sum = parseFloat(row[sumIndex]);
      transaction.category = row[categoryIndex];
      // transaction.userId should be set to the current user's ID somehow

      await this.transactionsRepository.save(transaction);
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
    return await this.transactionsRepository.find({ where: { userId: userId } });
  }


}