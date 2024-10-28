import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UploadedFile, UseInterceptors, Headers, BadRequestException, UsePipes, ValidationPipe, Put } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TransactionsService } from './transactions.service';
import { SharedService } from '../shared/shared.service';
import { Transactions } from './transactions.entity';
import { UsersService } from '../users/users.service';
import { CreateBillDto } from './dtos/create-bill.dto';
import { Source } from './source.entity';
//import { CreateSourceDto } from './dtos/create-source.dto';
//import { query } from 'express';
import { GetTransactionsDto } from './dtos/get-transactions.dto';
//import { log } from 'console';
import { UpdateTransactionsDto } from './dtos/update-transactions.dto';
import { ClassifyTransactionDto } from './dtos/classify-transaction.dto';
import multer from 'multer';

@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly sharedService: SharedService,
    private usersService: UsersService,) {}


  @Post('load-file')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Headers('token') token: string,
  ) {
    const userId = await this.usersService.getFirbsaeIdByToken(token);
    return this.transactionsService.saveTransactions(file, userId);
  }


  @Post('load-default-categories')
  @UseInterceptors(FileInterceptor('file'))
  async loadDefaultCategories(
    @UploadedFile() file: Express.Multer.File) {
    return this.transactionsService.loadDefaultCategories(file)
  }


  @Get('get_by_userID')
  async getTransactionsByUserID(@Query('billId') userID: string): Promise<Transactions[]> {
    console.log("this is user id thatttt i send: ", userID);

    return await this.transactionsService.getTransactionsByUserID(userID);
  }


  @Post('add-bill')
  async addBill(@Headers('token') token: string,
  @Body() body: CreateBillDto) {
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    return await this.transactionsService.addBill(userId, body.billName); 
  }


  @Post(':id/sources')
  async addSourceToBill(
    @Param('id') billId: number,
    @Headers('token') token: string,
    @Body() body: any,
    
    ): Promise<Source> {
      console.log(billId, body.sourceName, token);
      const userId = await this.usersService.getFirbsaeIdByToken(token)
    return this.transactionsService.addSourceToBill(billId, body.sourceName, userId);
  }


  @Get('get-bills')
  async getBills(
    @Headers('token') token: string
  ) {
    console.log("get-bills - start");
    const userId = await this.usersService.getFirbsaeIdByToken(token);
    return this.transactionsService.getBillsByUserId(userId);
  }
  

  @Get('get-sources')
  async getSources(@Headers('token') token: string) {
    const userId = await this.usersService.getFirbsaeIdByToken(token);
    return this.transactionsService.getSources(userId);
  }


  @Get('get-incomes')
  @UsePipes(new ValidationPipe({ transform: true }))
  async getIncomesForBill(
    @Query() query: GetTransactionsDto,
    @Headers('token') token: string
  ): Promise<Transactions[]> {
    
    const { startDate, endDate } = this.sharedService.getStartAndEndDate(query.year, query.month, query.isSingleMonth);
    
    // Construct a new query object with the additional fields
    const modifiedQuery = {
      ...query,
      startDate: startDate,
      endDate: endDate,
      userId: await this.usersService.getFirbsaeIdByToken(token)
    };
    return this.transactionsService.getIncomesTransactions(modifiedQuery);
  }


  @Get('get-expenses')
  @UsePipes(new ValidationPipe({ transform: true }))
  async getForBill(
    @Query() query: GetTransactionsDto,
    @Headers('token') token: string
  ): Promise<Transactions[]> {

    query.billId === 'null' ? null : parseInt(query.billId, 10);
    const { startDate, endDate } = this.sharedService.getStartAndEndDate(query.year, query.month, query.isSingleMonth);
  
    // Construct a new query object with the additional fields
    const modifiedQuery = {
      ...query,
      startDate: startDate,
      endDate: endDate,
      userId: await this.usersService.getFirbsaeIdByToken(token)
    };
    return this.transactionsService.getExpensesTransactions(modifiedQuery);
  }
  

  @Post('classify-trans')
  async classifyTransaction(
    @Body() classifyDto: ClassifyTransactionDto,
    @Headers('token') token: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('isSingleMonth') isSingleMonth: boolean
  ): Promise<void> {
    
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    const { startDate, endDate } = this.sharedService.getStartAndEndDate(year, month, isSingleMonth);
    //const startDateT = this.sharedService.convertDateToTimestamp(startDate);
    //const endDateT = this.sharedService.convertDateToTimestamp(endDate);
    return this.transactionsService.classifyTransaction(classifyDto, userId, startDate, endDate);
  }


  @Patch('update-trans')
  async updateTransaction(
    @Body() updateDto: UpdateTransactionsDto,
    @Headers('token') token: string,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('isSingleMonth') isSingleMonth: boolean
  ): Promise<{ message: string }> {
    console.log("in update trans");
    
    const userId = await this.usersService.getFirbsaeIdByToken(token);
    const { startDate, endDate } = this.sharedService.getStartAndEndDate(year, month, isSingleMonth);
    //const startDateT = this.sharedService.convertDateToTimestamp(startDate);
    //const endDateT = this.sharedService.convertDateToTimestamp(endDate);
    await this.transactionsService.updateTransaction(updateDto, userId, startDate, endDate);
    return { message: 'Transactions updated successfully' };
  }


  @Get('get-transactions-to-build-report')
  @UsePipes(new ValidationPipe({ transform: true }))
  async getTransactionsToBuildReport(
    @Query() query: GetTransactionsDto,
    @Headers('token') token: string
  ): Promise<Transactions[]> {

    console.log("getTransactionsToBuildReport - start");
    
    const userId = await this.usersService.getFirbsaeIdByToken(token);
    const { startDate, endDate } = this.sharedService.getStartAndEndDate(query.year, query.month, query.isSingleMonth);
    const startDateT = this.sharedService.convertDateToTimestamp(startDate);
    const endDateT = this.sharedService.convertDateToTimestamp(endDate);
    return this.transactionsService.getTransactionsToBuildReport(userId, startDateT, endDateT);
  }


  @Post('save-trans-to-expenses')
  async saveTransToExpenses(
  @Body() transactionData: {id: number, file: string | null}[],
  @Headers('token') token: string,
): Promise<{ message: string }> {

  console.log("in save trans: ", transactionData);
  console.log(token);
  
  const userId = await this.usersService.getFirbsaeIdByToken(token);

  return this.transactionsService.saveTransactionsToExpenses(transactionData, userId);
}


}