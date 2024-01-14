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

}
