import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UploadedFile, UseInterceptors, Headers, BadRequestException, UsePipes, ValidationPipe, Put } from '@nestjs/common';
import { FinsiteService } from './finsite.service';


@Controller('finsite')
export class FinsiteController {
  constructor(
    private readonly transactionsService: FinsiteService,
  ) {}


    @Post('finsite-connect')
    async connectToFinsite() {

      const userId =  process.env.FINSITE_ID;
      const password =  process.env.FINSITE_KEY;
      const startDate = "2024-07-01";
      const endDate = "2024-07-10";
      const data = await this.transactionsService.createFinsiteJsonFile(userId, password);
      
    }


}