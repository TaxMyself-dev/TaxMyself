import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UploadedFile, UseInterceptors, Headers, BadRequestException, UsePipes, ValidationPipe, Put, UseGuards, Req } from '@nestjs/common';
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
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';


@Controller('transactions')
export class TransactionsController {
  constructor(
    private readonly transactionsService: TransactionsService,
    private readonly sharedService: SharedService,
    private usersService: UsersService,) {}

  @Get('get-trans')
  //TODO: Add Admin guard
  async getTrans(@Query() query: any) {
    return this.transactionsService.getTransactionsFromFinsite(query.startDate, query.endDate, query.finsiteId );
  }


  @Post('load-file')
  @UseGuards(FirebaseAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const userId = request.user?.firebaseId;
    return this.transactionsService.saveTransactions(file, userId);
  }


  @Post('load-default-categories')
  //TODO: Add Admin guard
  @UseInterceptors(FileInterceptor('file'))
  async loadDefaultCategories(
    @UploadedFile() file: Express.Multer.File) {
    return this.transactionsService.loadDefaultCategories(file)
  }


  @Post('add-bill')
  @UseGuards(FirebaseAuthGuard)
  async addBill(
    @Req() request: AuthenticatedRequest,
    @Body() body: CreateBillDto) {
    const userId = request.user?.firebaseId;
    return await this.transactionsService.addBill(userId, body); 
  }


  @Post(':id/sources')
  @UseGuards(FirebaseAuthGuard)
  async addSourceToBill(
    @Req() request: AuthenticatedRequest,
    @Param('id') billId: number,
    @Body() body: any,
  ): Promise<Source> {
    const userId = request.user?.firebaseId;
    return this.transactionsService.addSourceToBill(billId, body.sourceName, body.sourceType, userId);
  }


  @Get('get-bills')
  @UseGuards(FirebaseAuthGuard)
  async getBills(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    console.log('User Firebase ID:', userId);
    return this.transactionsService.getBillsByUserId(userId);
  }
  

  @Get('get-sources')
  @UseGuards(FirebaseAuthGuard)
  async getSources(@Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    return this.transactionsService.getSources(userId);
  }


  @Get('get-incomes')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getIncomesForBill(
    @Req() request: AuthenticatedRequest,
    @Query() query: GetTransactionsDto,
  ): Promise<Transactions[]> {
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    const userId = request.user?.firebaseId;
    return this.transactionsService.getIncomesTransactions(userId, startDate, endDate, query.billId);
  }


  @Get('get-expenses')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getForBill(
    @Req() request: AuthenticatedRequest,
    @Query() query: GetTransactionsDto,
  ): Promise<Transactions[]> {
    query.billId === 'null' ? null : parseInt(query.billId, 10);
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    const userId = request.user?.firebaseId;
    return this.transactionsService.getExpensesTransactions(userId, startDate, endDate, query.billId);
  }
  

  @Post('classify-trans')
  @UseGuards(FirebaseAuthGuard)
  async classifyTransaction(
    @Req() request: AuthenticatedRequest,
    @Body() classifyDto: ClassifyTransactionDto,
    @Query('startDate') startDate: string | Date,
    @Query('endDate') endDate: string | Date,
  ): Promise<void> {
    startDate = this.sharedService.convertStringToDateObject(startDate);
    endDate = this.sharedService.convertStringToDateObject(endDate);
    const userId = request.user?.firebaseId;
    return this.transactionsService.classifyTransaction(classifyDto, userId, startDate, endDate);
  }


  @Patch('update-trans')
  @UseGuards(FirebaseAuthGuard)
  async updateTransaction(
    @Req() request: AuthenticatedRequest,
    @Body() updateDto: UpdateTransactionsDto,
    @Query('year') year: string,
    @Query('month') month: string,
    @Query('isSingleMonth') isSingleMonth: boolean
  ): Promise<{ message: string }> {
    console.log("in update trans");
    const userId = request.user?.firebaseId;
    const { startDate, endDate } = this.sharedService.getStartAndEndDate(year, month, isSingleMonth);
    await this.transactionsService.updateTransaction(updateDto, userId, startDate, endDate);
    return { message: 'Transactions updated successfully' };
  }


  @Get('get-expenses-to-build-report')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getExpensesToBuildReport(
    @Req() request: AuthenticatedRequest,
    @Query() query: GetTransactionsDto,
  ): Promise<Transactions[]> {
    console.log("query is: ", query);
    const userId = request.user?.firebaseId;
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    return this.transactionsService.getExpensesToBuildReport(userId, query.businessNumber, startDate, endDate);

  }

  @Get('get-incomes-to-build-report')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async getIncomesToBuildReport(
    @Req() request: AuthenticatedRequest,
    @Query() query: GetTransactionsDto,
  ): Promise<Transactions[]> {
    const userId = request.user?.firebaseId;
    const startDate = this.sharedService.convertStringToDateObject(query.startDate);
    const endDate = this.sharedService.convertStringToDateObject(query.endDate);
    return this.transactionsService.getIncomesToBuildReport(userId, startDate, endDate);
  }


  @Post('save-trans-to-expenses')
  @UseGuards(FirebaseAuthGuard)
  async saveTransToExpenses(
    @Req() request: AuthenticatedRequest,
    @Body() transactionData: {id: number, file: string | null}[],
  ): Promise<{ message: string }> {
    const userId = request.user?.firebaseId;
    return this.transactionsService.saveTransactionsToExpenses(transactionData, userId);
  }


}