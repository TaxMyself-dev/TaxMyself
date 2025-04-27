import { Body, Controller, Get, Headers, Param, Patch, Post, Req, Res, UseGuards, } from '@nestjs/common';
import { BookkeepingService } from './bookkeeping.service';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';



@Controller('bookkeeping')
export class BookkepingController {
  constructor(
    private readonly bookkeepingService: BookkeepingService,
  ) { }

}