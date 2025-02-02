import { Controller, Get } from '@nestjs/common';
import { DocumentsService } from './documents.service';


@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
  ) {}

    // @Get('finsite-connect')
    // async connectToFinsite() {
    //   const userId =  process.env.FINSITE_ID;
    //   const password =  process.env.FINSITE_KEY;
    //   return await this.documentsService.getFinsiteBills(userId, password);
    // }

}