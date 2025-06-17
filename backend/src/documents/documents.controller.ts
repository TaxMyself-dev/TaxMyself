import { Body, Controller, Get, Headers, Param, Patch, Post, Req, Res, UseGuards, } from '@nestjs/common';
import { Response } from 'express';
import { DocumentType } from 'src/enum';


import { DocumentsService } from './documents.service';
import { UsersService } from 'src/users/users.service';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';



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
    @Req() request: AuthenticatedRequest
  ) {
    const userId = request.user?.firebaseId;

    try {
      const { docIndex, generalIndex } = await this.documentsService.getCurrentIndexes(userId, typeDoc);
      return { docIndex, generalIndex };
    } catch (error) {
      throw error;
    }
  }


  @Post('setting-initial-index/:typeDoc')
  @UseGuards(FirebaseAuthGuard)
  async setInitialDocDetails(@Param('typeDoc') typeDoc: DocumentType, @Body() data: any, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    //console.log("🚀 ~ DocumentsController ~ setInitialDocDetails ~ userId:", userId)
    //console.log("data: ", data);
    //console.log("typeDoc: ", typeDoc);
    try {
      const docDetails = await this.documentsService.setInitialDocDetails(userId, typeDoc, data.initialIndex);
      //console.log("docDetails: ", docDetails);
      return docDetails
    }
    catch (error) {
      throw error;
    }
  }

  
  @Post('create-doc')
  @UseGuards(FirebaseAuthGuard)
  async createPDF(@Body() body: any, @Res() res: Response, @Req() request: AuthenticatedRequest) {
    const userId = request.user?.firebaseId;
    const pdfBuffer = await this.documentsService.createDoc(body, userId);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  }
  

  @Post('generate-pdf')
  @UseGuards(FirebaseAuthGuard)
  async generatePDF(@Body() body: any, @Res() res: Response, @Req() request: AuthenticatedRequest) {
    // const userId = request.user?.firebaseId;
    // console.log("body is ", body);
    
    const pdfBuffer = await this.documentsService.generatePDF(body, "pnlReport");
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  }

  
  @Post('generate-multiple')
  async generateMultipleDocuments(@Body() body: { userId: string }) {
    return this.documentsService.generateMultipleDocs(body.userId);
  }


}