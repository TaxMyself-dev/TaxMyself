import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UploadedFile, UseInterceptors, Headers, BadRequestException, UsePipes, ValidationPipe, Put } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TransactionsService } from './transactions.service';
import { SharedService } from '../shared/shared.service';
import { Transactions } from './transactions.entity';
import { UsersService } from '../users/users.service';
import { CreateBillDto } from './dtos/create-bill.dto';
import { Source } from './source.entity';
import { GetTransactionsDto } from './dtos/get-transactions.dto';
import { UpdateTransactionsDto } from './dtos/update-transactions.dto';
import { ClassifyTransactionDto } from './dtos/classify-transaction.dto';
import multer from 'multer';
import { SourceType } from 'src/enum';
import * as path from 'path';


@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly sharedService: SharedService,
    private usersService: UsersService,) {}

  @Get('get-trans')
  async getTrans( @Headers('token') token: string,  @Query() query: any) {

    console.log('Current Working Directory:', process.cwd());

    const isProduction = process.env.NODE_ENV === 'production';

    const basePath = isProduction ? path.join(process.cwd(), 'dist/finsite') : path.join(process.cwd(), 'src/finsite');
    const jsonFilePath = path.join(basePath, 'finsiteData.json');
  
    console.log('Resolved JSON file path:', jsonFilePath);
  

    // const jsonFilePath = isProduction
    //   ? path.resolve(__dirname, '../finsite/finsiteData.json')
    //   : path.resolve(__dirname, '../../src/finsite/finsiteData.json');

    console.log("jsonFilePath is ", jsonFilePath);
    
    return this.transactionsService.getTransactionsFromFinsite(jsonFilePath, query.startDate, query.endDate, query.finsiteId );
  }


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
    return await this.transactionsService.getTransactionsByUserID(userID);
  }


  @Post('add-bill')
  async addBill(@Headers('token') token: string,
  @Body() body: CreateBillDto) {
    const userId = await this.usersService.getFirbsaeIdByToken(token)
    return await this.transactionsService.addBill(userId, body); 
  }


  @Post(':id/sources')
  async addSourceToBill(
    @Param('id') billId: number,
    @Headers('token') token: string,
    @Body() body: any,
  ): Promise<Source> {
      const userId = await this.usersService.getFirbsaeIdByToken(token);
      return this.transactionsService.addSourceToBill(billId, body.sourceName, body.sourceType, userId);
  }


  @Get('get-bills')
  async getBills(
    @Headers('token') token: string
  ) {
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
        
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    const userId = await this.usersService.getFirbsaeIdByToken(token);

    return this.transactionsService.getIncomesTransactions(userId, startDate, endDate, query.billId);

  }


  @Get('get-expenses')
  @UsePipes(new ValidationPipe({ transform: true }))
  async getForBill(
    @Query() query: GetTransactionsDto,
    @Headers('token') token: string
  ): Promise<Transactions[]> {

    query.billId === 'null' ? null : parseInt(query.billId, 10);
  
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    const userId = await this.usersService.getFirbsaeIdByToken(token);
    return this.transactionsService.getExpensesTransactions(userId, startDate, endDate, query.billId);

  }
  

  @Post('classify-trans')
  async classifyTransaction(
    @Body() classifyDto: ClassifyTransactionDto,
    @Headers('token') token: string,
    @Query('startDate') startDate: string | Date,
    @Query('endDate') endDate: string | Date,
  ): Promise<void> {
    startDate = this.sharedService.convertStringToDateObject(startDate);
    endDate = this.sharedService.convertStringToDateObject(endDate);
    const userId = await this.usersService.getFirbsaeIdByToken(token)
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
    await this.transactionsService.updateTransaction(updateDto, userId, startDate, endDate);
    return { message: 'Transactions updated successfully' };
  }


  @Get('get-expenses-to-build-report')
  @UsePipes(new ValidationPipe({ transform: true }))
  async getExpensesToBuildReport(
    @Query() query: GetTransactionsDto,
    @Headers('token') token: string
  ): Promise<Transactions[]> {
    console.log("query is: ", query);
    
    const userId = await this.usersService.getFirbsaeIdByToken(token);
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    return this.transactionsService.getExpensesToBuildReport(userId, query.businessNumber, startDate, endDate);

  }

  @Get('get-incomes-to-build-report')
  @UsePipes(new ValidationPipe({ transform: true }))
  async getIncomesToBuildReport(
    @Query() query: GetTransactionsDto,
    @Headers('token') token: string
  ): Promise<Transactions[]> {
    
    const userId = await this.usersService.getFirbsaeIdByToken(token);
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    return this.transactionsService.getIncomesToBuildReport(userId, startDate, endDate);

  }


  @Post('save-trans-to-expenses')
  async saveTransToExpenses(
  @Body() transactionData: {id: number, file: string | null}[],
  @Headers('token') token: string,
  ): Promise<{ message: string }> {

    const userId = await this.usersService.getFirbsaeIdByToken(token);

    return this.transactionsService.saveTransactionsToExpenses(transactionData, userId);

  }


}