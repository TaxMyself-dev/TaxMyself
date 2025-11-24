import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { request } from 'http';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { BusinessService } from './business.service';
import { log } from 'console';

@Controller('business')
export class BusinessController {
  constructor(
        private readonly businessService: BusinessService,
  ) { }

  @Get('get-businesses')
  @UseGuards(FirebaseAuthGuard)
  async getBusinessesByUser(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    console.log("get-businesses called by firebaseId:", firebaseId);
    return this.businessService.getUserBusinesses(firebaseId);
  }

}