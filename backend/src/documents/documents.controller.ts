import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, Res, UseGuards, UsePipes, ValidationPipe, } from '@nestjs/common';
import { Response } from 'express';
import { DocumentType } from 'src/enum';
import { DocumentsService } from './documents.service';
import { UsersService } from 'src/users/users.service';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { log } from 'node:console';



@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
  ) { }


  @Get('get-docs')
  @UseGuards(FirebaseAuthGuard)
  async getFilteredDocs(
    @Req() request: AuthenticatedRequest,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('docType') docType?: DocumentType,
    @Query('issuerBusinessNumber') issuerBusinessNumber?: string, // optional query param
  ) {

    console.log("get-docs - start");

    if (!issuerBusinessNumber) {
      throw new BadRequestException('issuerBusinessNumber is required');
    }

    return this.documentsService.getDocuments(issuerBusinessNumber, startDate, endDate, docType);
  }


  @Get('get-setting-doc-by-type/:typeDoc')
  @UseGuards(FirebaseAuthGuard)
  async getSettingDocByType(
    @Param('typeDoc') typeDoc: DocumentType,
    @Query('issuerBusinessNumber') issuerBusinessNumber: string,
    @Req() request: AuthenticatedRequest
  ) {
    const userId = request.user?.firebaseId;

    try {
      // For non-GENERAL types, a valid issuerBusinessNumber is required
      if (typeDoc !== DocumentType.GENERAL) {
        if (!issuerBusinessNumber || !issuerBusinessNumber.trim()) {
          throw new BadRequestException('issuerBusinessNumber is required');
        }
      }
      const { docIndex, generalIndex, isInitial } = await this.documentsService.getCurrentIndexes(userId, typeDoc, issuerBusinessNumber);
      return { docIndex, generalIndex, isInitial };
    } catch (error) {
      throw error;
    }
  }


  @Post('setting-initial-index/:typeDoc')
  @UseGuards(FirebaseAuthGuard)
  async setInitialDocDetails(
    @Param('typeDoc') typeDoc: DocumentType,
    @Body() body: any,
    @Req() request: AuthenticatedRequest
  ) {
    const userId = request.user?.firebaseId;
    const initialIndex = Number(body.initialIndex);
    const issuerBusinessNumber: string = body.issuerBusinessNumber;
    console.log("🚀 ~ DocumentsController ~ setInitialDocDetails ~ issuerBusinessNumber:", issuerBusinessNumber)

    if (typeof initialIndex !== 'number' || isNaN(initialIndex)) {
      throw new BadRequestException('initialIndex must be a valid number');
    }

    if (!issuerBusinessNumber || !issuerBusinessNumber.trim()) {
      throw new BadRequestException('issuerBusinessNumber is required');
    }

    const docDetails = await this.documentsService.setInitialDocDetails(userId, typeDoc, initialIndex, issuerBusinessNumber);
    return docDetails;
  }

  
  @Post('create-doc')
  @UseGuards(FirebaseAuthGuard)
  async createDoc(@Body() body: any, @Req() request: AuthenticatedRequest) {
    console.log("createDoc in controller - start");
    const userId = request.user?.firebaseId;
    const result = await this.documentsService.createDoc(body, userId);
    return result;
  }


  @Post('preview-doc')
  @UseGuards(FirebaseAuthGuard)
  async previewDoc(@Body() body: any, @Res() res: Response, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    const pdfBuffer = await this.documentsService.previewDoc(body, userId);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  }
  

  @Post('rollback')
  @UseGuards(FirebaseAuthGuard)
  async rollback(@Body() body: { issuerBusinessNumber: string; generalDocIndex: string }) {
    const { issuerBusinessNumber, generalDocIndex } = body;
    return this.documentsService.rollbackDocumentAndIndexes(issuerBusinessNumber, generalDocIndex);
  }


  @Post('generate-pdf')
  @UseGuards(FirebaseAuthGuard)
  async generatePDF(@Body() body: any, @Res() res: Response, @Req() request: AuthenticatedRequest) {    
    const pdfBuffer = await this.documentsService.generatePDF(body, "pnlReport");
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  }

  
  @Post('generate-multiple')
  async generateMultipleDocuments(@Body() body: { userId: string }) {
    return this.documentsService.generateMultipleDocs(body.userId);
  }


}