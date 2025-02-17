import { Body, Controller, Get, Headers, Param, Patch, Post, Res, } from '@nestjs/common';
import { Response } from 'express';

import { DocumentsService } from './documents.service';
import { UsersService } from 'src/users/users.service';


@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    // private userService: UsersService,
  ) {}

  @Get('get-setting-doc-by-type/:typeDoc')
  async getSettingDocByType(@Headers('token') token: string, @Param('typeDoc') typeDoc: number) {
    console.log("typeDoc: ", typeDoc);
    console.log("token: ", token);
    // const userId = await this.userService.getFirbsaeIdByToken(token);
    const userId = "OJq1GyANgwgf6Pokz3LtXRc5hNg2";
    try {
      const docDetails = await this.documentsService.getSettingDocByType(userId, typeDoc);
      console.log("docDetails: ", docDetails);
      return docDetails;
    }
    catch (error) {
      throw error;
    }

  }

  @Post('setting-initial-index/:typeDoc')
  async setInitialDocDetails(@Headers('token') token: string, @Param('typeDoc') typeDoc: number, @Body() data: any) {
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

  @Patch('update-cerrunt-index/:typeDoc')
  async updateCurrentIndex(@Headers('token') token: string, @Param('typeDoc') typeDoc: number) {
    // const userId = await this.userService.getFirbsaeIdByToken(token);
    const userId = "OJq1GyANgwgf6Pokz3LtXRc5hNg2";
    try {
      const docDetails = await this.documentsService.updateCurrentIndex(userId, typeDoc);
      console.log("docDetails: ", docDetails);
      return docDetails
    }
    catch (error) {
      throw error;
    }
  }

  @Post('create-pdf')
  async createPDF(@Headers('token') token: string, @Body() body: any, @Res() res: Response) {
    //const firebaseId = await this.usersService.getFirbsaeIdByToken(token);
    const userId = "OJq1GyANgwgf6Pokz3LtXRc5hNg2";

    console.log("body: ", body);
    const pdfBuffer = await this.documentsService.createPDF(body);
    console.log("pdfBuffer: ", pdfBuffer);

    res.setHeader('Content-Type', 'application/pdf');
    return res.send(pdfBuffer);
  }
}