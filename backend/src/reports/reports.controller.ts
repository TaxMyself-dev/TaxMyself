import { Controller, Post, Patch, Get, Query, Param, Body, UseGuards, ValidationPipe } from '@nestjs/common';
import { CreateReportDto } from './dtos/create-report.dto';
import { ReportsService } from './reports.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { CurrentUser } from 'src/users/decorators/current-user.decorator';
import { User } from 'src/users/user.entity';
import { ReportDto } from './dtos/report.dto';
import { Serialize } from 'src/interceptors/serialize.interceptor';
import { ApproveReportDto } from './dtos/approve-report.dto';
import { AdminGuard } from 'src/guards/admin.guard';
import { GetEstimateDto } from './dtos/get-estimate.dto';
import { ExpenseFilterDto } from 'src/expenses/dtos/expense-filter.dto';
import { VatReportDto } from './dtos/vat-report.dto';

@Controller('reports')
export class ReportsController {
    constructor(private reportsService: ReportsService) {}

    @Get('total')
    // async getTotalExpenses(
    //     @Query('startDate') startDate: string,
    //     @Query('endDate') endDate: string,
    //     @Query('userId') userId: number,
    // ): Promise<number> {


    //async getTotalExpenses(@Query() expenseFilter: ExpenseFilterDto): Promise<number> {
    //async getTotalExpenses(@Query(new ValidationPipe({ transform: true })) expenseFilter: ExpenseFilterDto): Promise<number> {
    async getTotalExpenses(@Query() query: ExpenseFilterDto): Promise<VatReportDto> {

        // const vatReport: VatReportDto = {
        //     taxableTrans17: 0,
        //     taxableTrans18: 0,
        //     exemptTrans: 0,
        //     recognizeExpenses17: 0,
        //     recognizeExpenses18: 0,
        //     recognizeEquipExpenses17: 0,
        //     recognizeEquipExpenses18: 0
        // };

    console.log("total - start");

    console.log(query);

    const vatReport = await this.reportsService.getTotalExpenses(query);
    
    console.log(vatReport);
    
    return vatReport;
    }


    //@Get()
    //getEstimate(@Query() query: GetEstimateDto) {
    //    return this.reportsService.createEstimate(query);
    //    console.log(query);
    //}

    // @Post()
    // @UseGuards(AuthGuard)
    // @Serialize(ReportDto)
    // createReport(@Body() body: CreateReportDto, @CurrentUser() user: User) {
    //     return this.reportsService.create(body, user);
    // }

    //@Patch('/:id')
    //@UseGuards(AdminGuard)
    //approveReport(@Param('id') id: string, @Body() body: ApproveReportDto) {
    //    return this.reportsService.changeApproval(id, body.approved);
    //}



}
