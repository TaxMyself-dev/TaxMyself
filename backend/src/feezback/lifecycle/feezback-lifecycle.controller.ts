import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../../guards/firebase-auth.guard';
import { AuthenticatedRequest } from '../../interfaces/authenticated-request.interface';
import { UsersService } from '../../users/users.service';
import { FeezbackLifecycleService } from './feezback-lifecycle.service';

@Controller('admin/feezback')
@UseGuards(FirebaseAuthGuard)
export class FeezbackLifecycleController {
  constructor(
    private readonly lifecycle: FeezbackLifecycleService,
    private readonly users: UsersService,
  ) {}
  private async admin(req: AuthenticatedRequest) {
    const actor = req.user?.actorFirebaseId ?? req.user?.firebaseId;
    if (!actor || !(await this.users.isAdmin(actor)))
      throw new ForbiddenException('גישה מותרת רק למנהל');
    return actor;
  }
  @Get('users')
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('page') page = '0',
    @Query('limit') limit = '50',
  ) {
    await this.admin(req);
    if (
      !/^\d+$/.test(page) ||
      !/^\d+$/.test(limit) ||
      Number(limit) < 1 ||
      Number(limit) > 100 ||
      Number(page) > 100000
    )
      throw new BadRequestException('Invalid pagination');
    return this.lifecycle.list(Number(page), Number(limit));
  }
  @Post('users/:firebaseId/check')
  async check(
    @Req() req: AuthenticatedRequest,
    @Param('firebaseId') firebaseId: string,
  ) {
    return this.lifecycle.request(firebaseId, false, await this.admin(req));
  }
  @Post('users/:firebaseId/disconnect')
  async disconnect(
    @Req() req: AuthenticatedRequest,
    @Param('firebaseId') firebaseId: string,
    @Body() body: { confirm?: boolean },
  ) {
    const actor = await this.admin(req);
    if (body?.confirm !== true)
      throw new BadRequestException('נדרש אישור ניתוק');
    return this.lifecycle.request(firebaseId, true, actor);
  }
}
