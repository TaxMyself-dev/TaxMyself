import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { Transactions } from './transactions.entity';
import { parse } from 'date-fns';

interface ExcelRow {
  name: string;
  sum:  string;
  date: Date;
}

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transactions)
    private transactionsRepository: Repository<Transactions>,
  ) {}

  async processExcelFile(file: Express.Multer.File): Promise<{ message: string }> {
    if (!file) {
      throw new BadRequestException('No file uploaded.');
    }

    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows: ExcelRow[] = XLSX.utils.sheet_to_json(worksheet);

    for (const row of rows) {
      const transaction = new Transactions();
      transaction.name = row.name;
      transaction.sum = parseFloat(row.sum.toString()); // Convert to number
      transaction.date = row.date; // Format/convert date as needed

      await this.transactionsRepository.save(transaction);
    }

    // for (const row of rows) {
    //   const transaction = new Transactions();
    //   transaction.name = row.name;
    //   transaction.sum = parseFloat(row.sum);
    //   transaction.date = parse(row.date, 'yyyy-MM-dd', new Date());

    //   await this.transactionsRepository.save(transaction);
    // }

    return { message: 'Transactions saved successfully.' };
  }
}
