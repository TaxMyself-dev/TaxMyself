import { Controller, Post, Patch, Get, Query, Param, Body, UseGuards, ValidationPipe } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { VatReportRequestDto } from './dtos/vat-report-request.dto';
import { VatReportDto } from './dtos/vat-report.dto';

@Controller('reports')
export class ReportsController {
    
    constructor(private reportsService: ReportsService) {}

    @Get('vat-report')
        async getVatReport(@Query() query: VatReportRequestDto): Promise<VatReportDto> {
        console.log("getVarReport - start");
        console.log(query);
        const vatReport = await this.reportsService.createVatReport(query);
        console.log(vatReport);
        return vatReport;
    }

    @Get('tax-report')
    async getTaxReport(){
        const reductionReport = await this.reportsService.createReductionReport("L5gJkrdQZ5gGmte5XxRgagkqpOL2", 2023);
        //console.log(reductionReport);
    }

}