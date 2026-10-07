import { Controller, Get, UseGuards } from '@nestjs/common';
import { FinsiteService } from './finsite.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AdminGuard } from '../guards/admin.guard';


@Controller('finsite')
export class FinsiteController {
  constructor(
    private readonly transactionsService: FinsiteService,
  ) {}


    @Get('finsite-connect')
    @UseGuards(FirebaseAuthGuard, AdminGuard)
    async connectToFinsite() {
      const userId =  process.env.FINSITE_ID;
      const password =  process.env.FINSITE_KEY;
      return await this.transactionsService.getFinsiteBills(userId, password);
    }


}
