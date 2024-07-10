//General
import { Controller, Post, Patch, Get, Query, Param, Body, UseGuards, ValidationPipe } from '@nestjs/common';
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
        async getVatReport(@Query() query: VatReportRequestDto): Promise<VatReportDto> {
          
            let startDate: number;
            let endDate: number;
            let userId: string;

            startDate = this.sharedService.convertDateStrToTimestamp(query.startDate);
            endDate   = this.sharedService.convertDateStrToTimestamp(query.endDate);
            userId    = await this.usersService.getFirbsaeIdByToken(query.token)
        
            const vatReport = await this.reportsService.createVatReport(userId, startDate, endDate, query.vatableTurnover, query.nonVatableTurnover);
            return vatReport;
    }

    
    @Get('tax-report')
    async getTaxReport(){
        const reductionReport = await this.reportsService.createReductionReport("L5gJkrdQZ5gGmte5XxRgagkqpOL2", 2023);
        //console.log(reductionReport);
    }

}