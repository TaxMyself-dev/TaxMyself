import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { UsersService } from 'src/users/users.service';
import {
  DemoDataService,
  DemoProfileListItem,
  DemoResetResult,
  DemoSeedResult,
} from './demo-data.service';

@Controller('demo-data')
@UseGuards(FirebaseAuthGuard)
export class DemoDataController {
  constructor(
    private readonly service: DemoDataService,
    private readonly usersService: UsersService,
  ) {}

  @Get('profiles')
  async listProfiles(
    @Req() request: AuthenticatedRequest,
  ): Promise<DemoProfileListItem[]> {
    await this.assertAdmin(request);
    return this.service.listProfiles();
  }

  @Post('profiles/:id/seed')
  @HttpCode(HttpStatus.OK)
  async seed(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<DemoSeedResult> {
    await this.assertAdmin(request);
    return this.service.seedProfile(id);
  }

  @Post('profiles/:id/reset')
  @HttpCode(HttpStatus.OK)
  async reset(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<DemoResetResult> {
    await this.assertAdmin(request);
    return this.service.resetProfile(id);
  }

  private async assertAdmin(request: AuthenticatedRequest): Promise<void> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new ForbiddenException('לא אותחל משתמש');
    const isAdmin = await this.usersService.isAdmin(firebaseId);
    if (!isAdmin) throw new ForbiddenException('גישה מותרת רק למנהל');
  }
}
