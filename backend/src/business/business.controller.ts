import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Req, UseGuards, UsePipes, ValidationPipe } from '@nestjs/common';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { BusinessService } from './business.service';
import { UpdateBusinessDto } from './dtos/update-business.dto';
import { CreateBusinessDto } from './dtos/create-business.dto';

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

  @Post('create')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createBusiness(@Req() request: AuthenticatedRequest, @Body() dto: CreateBusinessDto) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) {
      throw new BadRequestException('Firebase ID is missing');
    }
    return this.businessService.createBusiness(firebaseId, dto);
  }

  @Delete(':id')
  @UseGuards(FirebaseAuthGuard)
  async deleteBusiness(@Req() request: AuthenticatedRequest, @Param('id', ParseIntPipe) id: number) {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) {
      throw new BadRequestException('Firebase ID is missing');
    }
    await this.businessService.deleteBusiness(firebaseId, id);
  }

  @Patch('update')
  @UseGuards(FirebaseAuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  async updateBusiness(@Req() req: AuthenticatedRequest, @Body() dto: UpdateBusinessDto) {
    const firebaseId = req.user?.firebaseId;
    if (!firebaseId) {
      throw new BadRequestException('Firebase ID is missing');
    }
    return this.businessService.updateBusiness(firebaseId, dto);
  }
}