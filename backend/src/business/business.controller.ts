import { BadRequestException, Body, Controller, Get, Patch, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { BusinessService } from './business.service';
import { UpdateBusinessDto } from './dtos/update-business.dto';

@Controller('business')
export class BusinessController {
  constructor(
    private readonly businessService: BusinessService,
  ) {}

  @Get('get-businesses')
  @UseGuards(FirebaseAuthGuard)
  async getBusinessesByUser(@Req() request: AuthenticatedRequest) {
    const firebaseId = request.user?.firebaseId;
    return this.businessService.getUserBusinesses(firebaseId);
  }

  @Patch('update')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async updateBusiness(@Req() req: AuthenticatedRequest, @Body() dto: UpdateBusinessDto) {
    const firebaseId = req.user?.firebaseId;
    if (!firebaseId) {
      throw new BadRequestException('Firebase ID is missing');
    }
    return this.businessService.updateBusiness(firebaseId, dto.businessNumber, dto);
  }
}