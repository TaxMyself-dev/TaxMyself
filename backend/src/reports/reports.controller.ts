//General
import { Controller, Post, Patch, Get, Query, Param, Body, Headers, UseGuards, ValidationPipe } from '@nestjs/common';
//Services 
import { ReportsService } from './reports.service';
import { SharedService } from '../shared/shared.service';
import { UsersService } from '../users/users.service';
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
        @Query() query: VatReportRequestDto,
    ): Promise<VatReportDto> {
      
        const firebaseId = await this.usersService.getFirbsaeIdByToken(token);
        const singleMonth = query.isSingleMonth === 'true' ? true : false;
        const monthReport = Number(query.monthReport);
    
        const vatReport = await this.reportsService.createVatReport(firebaseId, singleMonth, monthReport, query.vatableTurnover, query.nonVatableTurnover);

        return vatReport;
    }

    
    @Get('tax-report')
    async getTaxReport(){
        const reductionReport = await this.reportsService.createReductionReport("L5gJkrdQZ5gGmte5XxRgagkqpOL2", 2023);
    }

}