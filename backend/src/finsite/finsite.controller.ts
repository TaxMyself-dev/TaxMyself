import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UploadedFile, UseInterceptors, Headers, BadRequestException, UsePipes, ValidationPipe, Put } from '@nestjs/common';
import { FinsiteService } from './finsite.service';


@Controller('finsite')
export class FinsiteController {
  constructor(
    private readonly transactionsService: FinsiteService,
  ) {}


    @Get('finsite-connect')
    async connectToFinsite() {
      const userId =  process.env.FINSITE_ID;
      const password =  process.env.FINSITE_KEY;
      return await this.transactionsService.getFinsiteBills(userId, password);
    }


}