import { Body, Controller, Get, Headers, Param, Patch, Post, Res, } from '@nestjs/common';
import { Response } from 'express';
import { DocumentType } from 'src/enum';


import { DocumentsService } from './documents.service';
import { UsersService } from 'src/users/users.service';


@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    // private userService: UsersService,
  ) {}

  @Get('get-setting-doc-by-type/:typeDoc')
  async getSettingDocByType(@Param('typeDoc') typeDoc: DocumentType) {
    //console.log("typeDoc: ", typeDoc);
    //console.log("token: ", token);
    // const userId = await this.userService.getFirbsaeIdByToken(token);
    const userId = "OJq1GyANgwgf6Pokz3LtXRc5hNg2";
    try {
      const docDetails = await this.documentsService.getSettingDocByType(userId, typeDoc);
      //console.log("docDetails: ", docDetails);
      return docDetails;
    }
    catch (error) {
      throw error;
    }

  }

  @Post('setting-initial-index/:typeDoc')
  async setInitialDocDetails(@Param('typeDoc') typeDoc: DocumentType, @Body() data: any) {
    // const userId = await this.userService.getFirbsaeIdByToken(token);
    console.log("data: ", data);
    console.log("typeDoc: ", typeDoc);

    const userId = "OJq1GyANgwgf6Pokz3LtXRc5hNg2";
    try {
      const docDetails = await this.documentsService.setInitialDocDetails(userId, typeDoc, data.initialIndex);
      console.log("docDetails: ", docDetails);
      return docDetails
    }
    catch (error) {
      throw error;
    }
  }

  // @Patch('update-cerrunt-index/:typeDoc')
  // async updateCurrentIndex(@Headers('token') token: string, @Param('typeDoc') typeDoc: DocumentType) {
  //   // const userId = await this.userService.getFirbsaeIdByToken(token);
  //   const userId = "OJq1GyANgwgf6Pokz3LtXRc5hNg2";
  //   try {
  //     const docDetails = await this.documentsService.incrementCurrentIndex(userId, typeDoc);
  //     console.log("docDetails: ", docDetails);
  //     return docDetails
  //   }
  //   catch (error) {
  //     throw error;
  //   }
  // }

  @Post('create-doc')
  async createPDF(@Body() body: any, @Res() res: Response) {
    const userId = "OJq1GyANgwgf6Pokz3LtXRc5hNg2";
    console.log("🚀 ~ DocumentsController ~ createPDF ~ body:", body)
    const pdfBuffer = await this.documentsService.createDoc(body, userId);

    //console.log("body: ", body);
    console.log("pdfBuffer: ", pdfBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  }

  @Post('generate-pdf')
  async generatePDF(@Body() body: any, @Res() res: Response) {
    const userId = "OJq1GyANgwgf6Pokz3LtXRc5hNg2";
    const pdfBuffer = await this.documentsService.generatePDF(body, userId);
    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  }

  // @Post('add-doc')
  // async addDoc(@Headers('token') token: string, @Body() body: any) {
  //   //const firebaseId = await this.usersService.getFirbsaeIdByToken(token);
  //   const userId = "OJq1GyANgwgf6Pokz3LtXRc5hNg2";
  //   return this.documentsService.addDoc(userId, body);
  // }
}