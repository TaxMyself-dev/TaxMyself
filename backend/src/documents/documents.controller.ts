import { BadRequestException, Body, Controller, Get, Headers, Param, Patch, Post, Query, Req, Res, UseGuards, } from '@nestjs/common';
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
    // private userService: UsersService,
  ) { }


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
  async createDoc(@Body() body: any, @Res() res: Response, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    const pdfBuffer = await this.documentsService.createDoc(body, userId);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  }


  @Post('preview-doc')
  @UseGuards(FirebaseAuthGuard)
  async previewDoc(@Body() body: any, @Res() res: Response, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    const pdfBuffer = await this.documentsService.previewDoc(body, userId);
    console.log('🔹 [preview-doc] pdfBuffer type:', typeof pdfBuffer);
    console.log('🔹 [preview-doc] pdfBuffer length:', pdfBuffer?.length || 0);
    console.log('🔹 [preview-doc] pdfBuffer is Buffer?', Buffer.isBuffer(pdfBuffer));
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
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