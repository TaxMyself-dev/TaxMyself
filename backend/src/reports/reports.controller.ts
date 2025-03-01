//General
import { Response } from 'express';
import { Controller, Post, Patch, Get, Query, Param, Body, Headers, UseGuards, ValidationPipe, Res, Req, UploadedFile, UseInterceptors, HttpException, HttpStatus} from '@nestjs/common';
//Services 
import { ReportsService } from './reports.service';
import { SharedService } from '../shared/shared.service';
import { UsersService } from '../users/users.service';
import { VatReportRequestDto } from './dtos/vat-report-request.dto';
import { VatReportDto } from './dtos/vat-report.dto';
import { PnLReportDto } from './dtos/pnl-report.dto';
import { PnLReportRequestDto } from './dtos/pnl-report-request.dto';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';


@Controller('reports')
export class ReportsController {

    constructor(private reportsService: ReportsService,
        private sharedService: SharedService,
        private usersService: UsersService) { }


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
        const pnlReport = await this.reportsService.createPnLReport(firebaseId, query.businessNumber, startDate, endDate);

        return pnlReport;
    }


    @Post('create-uniform-file')
    @UseGuards(FirebaseAuthGuard)
    async getHelloWorldZip(
        @Req() request: AuthenticatedRequest,
        @Body() body: any,
        @Res() res: Response) {  
            const userId = request.user?.firebaseId;
            console.log("startDate is ", body.startDate);
            console.log("endDate is ", body.endDate);
            console.log("businessNumber is ", body.businessNumber);
            const { fileName, zipBuffer } = await this.reportsService.createUniformFile(userId, body.startDate, body.endDate, body.businessNumber);
            res.set({
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename=${fileName}`,
            });
        res.send(zipBuffer);
    }



    @Post('upload-and-debug')
    @UseInterceptors(
      FileInterceptor('file', {
        storage: diskStorage({
          destination: './src/generated/', // Save uploaded files here
          filename: (req, file, callback) => {
            const fileExt = extname(file.originalname);
            const fileName = file.originalname.replace(fileExt, '') + '-' + Date.now() + fileExt;
            callback(null, fileName);
          }
        })
      })
    )
    async uploadAndDebug(@UploadedFile() file: Express.Multer.File, @Res() res: Response) {
      if (!file) {
        throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
      }
  
      try {
        // Parse and generate debug file
        const debugFilePath = await this.reportsService.parseAndSaveDebugFile(file.filename);
  
        // Send the debug file as a download
        res.download(debugFilePath);
      } catch (error) {
        throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }
    }


}