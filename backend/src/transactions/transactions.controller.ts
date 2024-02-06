import { Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TransactionsService } from './transactions.service';

@Controller('excel')
export class TransactionsController {
  constructor(private readonly excelService: TransactionsService) {}

  @Post('save')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.excelService.saveTransactions(file);
  }
}