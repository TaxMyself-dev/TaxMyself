import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UploadedFile, UseInterceptors, Headers } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TransactionsService } from './transactions.service';
import { SharedService } from 'src/shared/shared.service';
import { Transactions } from './transactions.entity';
import { UsersService } from 'src/users/users.service';
import { CreateBillDto } from './dtos/create-bill.dto';
import { Source } from './source.entity';
import { CreateSourceDto } from './dtos/create-source.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly sharedService: SharedService,
    private usersService: UsersService,) {}

  @Post('load-file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    return this.transactionsService.saveTransactions(file);
  }

  @Get('get_by_userID')
  async getTransactionsByUserID(@Query('billId') userID: string): Promise<Transactions[]> {
    console.log("this is user id thatttt i send: ", userID);

    return await this.transactionsService.getTransactionsByUserID(userID);
  }


  @Post('add-bill')
  async addBill(@Body() body: CreateBillDto) {
    const userId = await this.usersService.getFirbsaeIdByToken(body.token)
    return await this.transactionsService.addBill(userId, body.billName); 
  }


  // @Get('get-bills')
  // async getUserBills(@Query('userId') isEquipment: boolean): Promise<string[]> {
  //   return this.transactionsService.getBillsByUserId(userId);
  // }

  
  @Post(':id/sources')
  async addSourceToBill(
    @Param('id') id: number,
    @Body() body: CreateSourceDto,
  ): Promise<Source> {
    const userId = await this.usersService.getFirbsaeIdByToken(body.token)
    return this.transactionsService.addSourceToBill(id, body.sourceName, userId);
  }


  @Get('get-bills')
  async getBills(
    @Headers('token') token: string
  ) {
    const userId = await this.usersService.getFirbsaeIdByToken(token);
    return this.transactionsService.getBillsByUserId(userId);
  }


  @Get(':id/get-transactions')
  async getTransactionsForBill(
    @Param('id') id: number,
    @Body() body: any
  ): Promise<Transactions[]> {
    const userId = await this.usersService.getFirbsaeIdByToken(body.token)
    return this.transactionsService.getTransactionsByBillAndUserId(id, userId);
  }


  @Get('get-incomes')
  async getIncomesForBill(
    //@Param('id') id: number,
    //@Query('billId') billId: number | null,
    @Query('billId') billId: string,
    // @Body() body: any
    @Headers('token') token: string
  ): Promise<Transactions[]> {
    const parsedBillId = billId === 'null' ? null : parseInt(billId, 10);
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    return this.transactionsService.getIncomesTransactions(parsedBillId, userId);
  }


  @Get('get-expenses')
  async getForBill(
    @Query('billId') billId: string,
    @Headers('token') token: string
    // @Body() body: any
  ): Promise<Transactions[]> {
    const parsedBillId = billId === 'null' ? null : parseInt(billId, 10);
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    return this.transactionsService.getExpensesTransactions(parsedBillId, userId);
  }


  @Get('try-1')
  async getTransactions(@Query() query): Promise<Transactions[]> {
    return this.sharedService.findEntities(Transactions, query);
      //return this.genericService.findEntities(Transactions, query);
  }


}