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
  DemoTestResetResult,
} from './demo-data.service';
import { isDemoEmail } from './profiles';

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

  /**
   * In-app reset triggered by a demo user from their own dashboard. NOT
   * admin-gated — the caller's email is checked against DEMO_PROFILES,
   * so only demo users can hit this. Wipes Drive + DB derived state and
   * re-uploads the sample files (see DemoDataService.testReset for the
   * full purge list). Preserves the user identity so the session stays
   * valid.
   */
  @Post('test-reset')
  @HttpCode(HttpStatus.OK)
  async testReset(
    @Req() request: AuthenticatedRequest,
  ): Promise<DemoTestResetResult> {
    console.log(`[test-reset][controller] ENTRY — POST /demo-data/test-reset received`);
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) {
      console.log(`[test-reset][controller] REJECTED — no firebaseId on request`);
      throw new ForbiddenException('לא אותחל משתמש');
    }
    console.log(`[test-reset][controller] firebaseId=${firebaseId.substring(0, 8)}...`);
    const user = await this.usersService.findByFirebaseId(firebaseId);
    if (!isDemoEmail(user?.email)) {
      console.log(
        `[test-reset][controller] REJECTED — email "${user?.email}" not in DEMO_PROFILES`,
      );
      throw new ForbiddenException('אפס נתוני בדיקה זמין רק למשתמשי דמו');
    }
    console.log(`[test-reset][controller] AUTHORIZED email=${user?.email} — calling service.testReset`);
    return this.service.testReset(firebaseId);
  }

  private async assertAdmin(request: AuthenticatedRequest): Promise<void> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new ForbiddenException('לא אותחל משתמש');
    const isAdmin = await this.usersService.isAdmin(firebaseId);
    if (!isAdmin) throw new ForbiddenException('גישה מותרת רק למנהל');
  }
}
