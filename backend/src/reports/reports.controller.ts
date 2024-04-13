import { Controller, Post, Patch, Get, Query, Param, Body, UseGuards, ValidationPipe } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { SharedService } from 'src/shared/shared.service';
import { VatReportRequestDto } from './dtos/vat-report-request.dto';
import { VatReportDto } from './dtos/vat-report.dto';
import { log } from 'console';

@Controller('reports')
export class ReportsController {
    
    constructor(private reportsService: ReportsService,
                private sharedService: SharedService) {}

    @Get('vat-report')
        async getVatReport(@Query() query: VatReportRequestDto): Promise<VatReportDto> {
            let startDate;
            let endDate;
            console.log("getVarReport - start");
            console.log("1 start date is ", query.startDate, "type: ", typeof(query.startDate));
            console.log("1 end date is ", query.endDate, "type: ", typeof(query.endDate));

            startDate = this.sharedService.convertDateToTimestamp(query.startDate);
            endDate   = this.sharedService.convertDateToTimestamp(query.endDate);

            console.log("2 start date is ", startDate);
            console.log("2 end date is ", endDate)
            
        
            const vatReport = await this.reportsService.createVatReport(query.userId, startDate, endDate, query.vatableTurnover, query.nonVatableTurnover);
            return vatReport;
    }

    @Get('tax-report')
    async getTaxReport(){
        const reductionReport = await this.reportsService.createReductionReport("L5gJkrdQZ5gGmte5XxRgagkqpOL2", 2023);
        //console.log(reductionReport);
    }

}