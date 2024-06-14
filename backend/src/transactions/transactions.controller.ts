import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TransactionsService } from './transactions.service';
import { Transactions } from './transactions.entity';
import { UsersService } from 'src/users/users.service';
import { CreateBillDto } from './dtos/create-bill.dto';
import { Source } from './source.entity';
import { CreateSourceDto } from './dtos/create-source.dto';

@Controller('excel')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private usersService: UsersService,) {}

  @Post('save')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.transactionsService.saveTransactions(file);
  }

  @Get('get_by_userID')
  async getTransactionsByUserID(@Query('userID') userID: string): Promise<Transactions[]> {
    console.log("this is user id that i send: ", userID);

    return await this.transactionsService.getTransactionsByUserID(userID);
  }


  @Post('add-bill')
  async addBill(@Body() body: CreateBillDto) {
    const userId = await this.usersService.getFirbsaeIdByToken(body.token)
    return await this.transactionsService.addBill(userId, body.billName); 
  }

  
  @Post(':id/sources')
  async addSourceToBill(
    @Param('id') id: number,
    @Body() body: CreateSourceDto,
  ): Promise<Source> {
    const userId = await this.usersService.getFirbsaeIdByToken(body.token)
    return this.transactionsService.addSourceToBill(id, body.sourceName, userId);
  }

}