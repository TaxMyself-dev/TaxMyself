import { Controller, Get, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TransactionsService } from './transactions.service';
import { Transactions } from './transactions.entity';

@Controller('excel')
export class TransactionsController {
  constructor(private readonly excelService: TransactionsService) {}

  @Post('save')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.excelService.saveTransactions(file);
  }

  @Get('get_by_userID')
  async getTransactionsByUserID(@Query('userID') userID: string): Promise<Transactions[]> {
    console.log("this is user id that i send: ", userID);

    return await this.excelService.getTransactionsByUserID(userID);
  }
}