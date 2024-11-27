//General
import { Controller, Post, Patch, Get, Query, Param, Body, Headers, UseGuards, ValidationPipe } from '@nestjs/common';
//Services 
import { ReportsService } from './reports.service';
import { SharedService } from '../shared/shared.service';
import { UsersService } from '../users/users.service';
import { VatReportRequestDto } from './dtos/vat-report-request.dto';
import { VatReportDto } from './dtos/vat-report.dto';
import { PnLReportDto } from './dtos/pnl-report.dto';
import { log } from 'console';
import { PnLReportRequestDto } from './dtos/pnl-report-request.dto';

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

        console.log("reports.controller - vat-report start");
      
        const firebaseId = await this.usersService.getFirbsaeIdByToken(token);
        const startDate = this.sharedService.convertStringToDateObject(query.startDate);
        const endDate = this.sharedService.convertStringToDateObject(query.endDate);
        const vatReport = await this.reportsService.createVatReport(firebaseId, query.businessNumber, startDate, endDate);

        console.log("vatReport is ", vatReport);
        

        return vatReport;
    }


    @Get('pnl-report')
    async getPnLReport(
        @Headers('token') token: string,
        @Query() query: any,
    ): Promise<PnLReportDto> {
      
        console.log("reports.controller - pnl-report start");

        const firebaseId = await this.usersService.getFirbsaeIdByToken(token);
        const startDate = this.sharedService.convertStringToDateObject(query.startDate);
        const endDate = this.sharedService.convertStringToDateObject(query.endDate);
        const businessNumber = "123456789";
        const pnlReport = await this.reportsService.createPnLReport(firebaseId, businessNumber, startDate, endDate);

        return pnlReport;
    }

    
    // @Get('tax-report')
    // async getTaxReport(){
    //     const reductionReport = await this.reportsService.createReductionReport("L5gJkrdQZ5gGmte5XxRgagkqpOL2", 2023);
    // }

}