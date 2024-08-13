//General
import { Controller, Post, Patch, Get, Query, Param, Body, Headers, UseGuards, ValidationPipe } from '@nestjs/common';
//Services 
import { ReportsService } from './reports.service';
import { SharedService } from 'src/shared/shared.service';
import { UsersService } from 'src/users/users.service';
import { VatReportRequestDto } from './dtos/vat-report-request.dto';
import { VatReportDto } from './dtos/vat-report.dto';
import { log } from 'console';

@Controller('reports')
export class ReportsController {
    
    constructor(private reportsService: ReportsService,
                private sharedService: SharedService,
                private usersService: UsersService) {}

    @Get('vat-report')
        async getVatReport(
            @Headers('token') token: string,
            @Query() query: VatReportRequestDto): Promise<VatReportDto> {
          
            const userId = await this.usersService.getFirbsaeIdByToken(token);
            const { startDate, endDate } = this.sharedService.getStartAndEndDate(query.year, query.month, query.isSingleMonth);
            const startDateT = this.sharedService.convertDateToTimestamp(startDate);
            const endDateT = this.sharedService.convertDateToTimestamp(endDate);
        
            const vatReport = await this.reportsService.createVatReport(userId, startDateT, endDateT, query.vatableTurnover, query.nonVatableTurnover);
            return vatReport;
    }

    
    @Get('tax-report')
    async getTaxReport(){
        const reductionReport = await this.reportsService.createReductionReport("L5gJkrdQZ5gGmte5XxRgagkqpOL2", 2023);
        //console.log(reductionReport);
    }

}