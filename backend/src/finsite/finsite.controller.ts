import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UploadedFile, UseInterceptors, Headers, BadRequestException, UsePipes, ValidationPipe, Put } from '@nestjs/common';
import { FinsiteService } from './finsite.service';


@Controller('finsite')
export class FinsiteController {
  constructor(
    private readonly transactionsService: FinsiteService,
  ) {}


    @Post('finsite-connect')
    async connectToFinsite() {

      const userId =  "BH";
      const password =  "IK575379";
      const startDate = "2024-07-01";
      const endDate = "2024-07-30";
      const data = await this.transactionsService.getTransactions(userId, password, startDate, endDate);
      //console.log("sessionId is ", sessionId);
      //return sessionId;
      
    }


}