import { Controller, Post, Patch, Get, Delete, Query, Param, Body, Req, UseGuards } from '@nestjs/common';
import { CreateSupplierDto } from './dtos/create-supplier.dto';
import { UpdateSupplierDto } from './dtos/update-supplier.dto';
import { SuppliersService } from './suppliers.service';
import { AuthService } from 'src/users/auth.service';

@Controller('suppliers')
export class SuppliersController {
  constructor(
    private supplierService: SuppliersService,
    private authService: AuthService) {}

  @Post('add-supplier')
  async addExpense(@Body() body: CreateSupplierDto) {
    const userId = await this.authService.getFirbsaeIdByToken(body.token)
    return await this.supplierService.addSupplier(body, userId); 
  } 
  catch (error) {
    console.log("משתמש לא חוקי");
    console.log("this is errorrrrrrrr :",error);
    return {message: "invalid user"};  
  }

  @Patch('update-supplier/:id')
  async updateExpense(@Param('id') id: number, @Body() body: UpdateSupplierDto) {

    const userId = await this.authService.getFirbsaeIdByToken(body.token)

    return this.supplierService.updateSupplier(id, userId, body);

  }

  @Delete('delete-supplier/:id')
  async deleteSupplier(@Param('id') id: number, @Body() body: UpdateSupplierDto) {

    const userId = await this.authService.getFirbsaeIdByToken(body.token)

    return this.supplierService.deleteSupplier(id, userId);

  }
    

//   @Get('get_by_supplier')
//   async getExpensesBySupplier(@Query('supplier') supplier: string): Promise<Expense[]> {
//     return await this.expensesService.getExpensesBySupplier(supplier);
//   }

//   @Get('get_by_userID')
//   async getExpensesByUserID(@Query('userID') userID: string): Promise<Expense[]> {
//     console.log("this is user id that i send: ", userID);
    
//     return await this.expensesService.getExpensesByUserID(userID);
//   }

//   @Get('get_by_date')
//   async getExpensesWithinDateRange(@Query('startDate') startDate: string, @Query('endDate') endDate: string): Promise<Expense[]> {
//     return await this.expensesService.getExpensesWithinDateRange(startDate, endDate);
//   }


}
