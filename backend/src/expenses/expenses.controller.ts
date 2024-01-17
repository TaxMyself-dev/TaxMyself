import { Controller, Post, Patch, Get, Delete, Query, Param, Body, Req, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateExpenseDto } from './dtos/create-expense.dto';
import { UpdateExpenseDto } from './dtos/update-expense.dto';
import { GetExpenseDto } from './dtos/get-expense.dto';
import { ExpensesService } from './expenses.service';
import { AuthService } from 'src/users/auth.service';
import { UsersService } from 'src/users/users.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { CurrentUser } from 'src/users/decorators/current-user.decorator';
import { User } from 'src/users/user.entity';
import { ExpenseDto } from './dtos/expense.dto';
import { Expense } from './expenses.entity';
import { Serialize } from 'src/interceptors/serialize.interceptor';
import { AdminGuard } from 'src/guards/admin.guard';
import { query } from 'express';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import * as tesseract from 'tesseract.js';



@Controller('expenses')
//@UseGuards(FirebaseAuthGuard)
export class ExpensesController {
  constructor(
    private expensesService: ExpensesService,
    private authService: AuthService) {}

  @Post('add')
  async addExpense(@Body() body: CreateExpenseDto) {
    const userId = await this.authService.getFirbsaeIdByToken(body.token)
    console.log("body of expense :", body);
    console.log("user id in addExpense :", userId);
    return await this.expensesService.addExpense(body, userId); 
  } 
  catch (error) {
    console.log("משתמש לא חוקי");
    console.log("this is errorrrrrrrr :",error);
    return {message: "invalid user"};  
  }

  @Patch('update-expense/:id')
  async updateExpense(@Param('id') id: number, @Body() body: UpdateExpenseDto) {

    const userId = await this.authService.getFirbsaeIdByToken(body.token)

    console.log("controller update expense - Start");
    console.log("body of update expense :", body);

    return this.expensesService.updateExpense(id, userId, body);

  }

  @Delete('delete-expense/:id')
  async deleteExpense(@Param('id') id: number, @Body() body: UpdateExpenseDto) {

    console.log("controller delete expense - Start");

    const userId = await this.authService.getFirbsaeIdByToken(body.token)

    return this.expensesService.deleteExpense(id, userId);

  }

  // @Post('extract-invoice')
  // @UseInterceptors(FileInterceptor('invoice', { dest: './uploads' }))
  // async extractInvoiceData(@UploadedFile() file: Express.Multer.File) {
  //   if (!file) {
  //     throw new BadRequestException('No invoice file uploaded.');
  //   }

  //   // Use Tesseract.js to process the uploaded file
  //   const result = await tesseract.recognize(file.path, 'eng', {
  //     logger: (m) => console.log(m),
  //   });

  //   // Extract relevant data from the OCR result
  //   const extractedData = extractDataFromOCRResult(result);

  //   // Return the extracted data
  //   return extractedData;
  // }

}

// function extractDataFromOCRResult(result) {
//   // Implement logic to extract the sum, invoice number, and date from the OCR result
//   // This will depend on the structure of your invoices and the text content
//   // You may need to use regular expressions or specific keywords to identify and extract the data

//   // For example:
//   const sum = extractSum(result.text);
//   const invoiceNumber = extractInvoiceNumber(result.text);
//   const date = extractDate(result.text);

//   return { sum, invoiceNumber, date };
// }

// function extractSum(text) {
//   // Implement logic to extract the sum from the text
//   // Example: Use regular expressions to find a currency symbol and numeric value
// }

// function extractInvoiceNumber(text) {
//   // Implement logic to extract the invoice number from the text
// }

// function extractDate(text) {
//   // Implement logic to extract the date from the text
// }
