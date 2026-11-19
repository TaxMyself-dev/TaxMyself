import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import {
  AutoClassificationService,
  autoIdentity,
} from './auto-classification.service';
class ConsentDto {
  @IsBoolean() enabled: boolean;
}
class ReplyDto {
  @IsString() @MaxLength(2000) answer: string;
}
function identity(req: AuthenticatedRequest) {
  return {
    ...autoIdentity(req.user.firebaseId),
    actorFirebaseId: req.user.actorFirebaseId ?? req.user.firebaseId,
    isDelegatedAccess: req.isDelegatedAccess === true,
    isAdminImpersonation: req.isAdminImpersonation === true,
  };
}
@Controller('api/agent-automation')
@UseGuards(FirebaseAuthGuard)
export class AutoClassificationController {
  constructor(private readonly service: AutoClassificationService) {}
  @Get() status(@Req() r: AuthenticatedRequest) {
    return this.service.status(identity(r));
  }
  @Post('consent') consent(
    @Req() r: AuthenticatedRequest,
    @Body() body: ConsentDto,
  ) {
    return this.service.consent(identity(r), body.enabled);
  }
  @Post('dismiss') dismiss(@Req() r: AuthenticatedRequest) {
    return this.service.dismiss(identity(r));
  }
  @Post('start') start(@Req() r: AuthenticatedRequest) {
    return this.service.start(identity(r));
  }
  @Get('notifications') inbox(
    @Req() r: AuthenticatedRequest,
    @Query('before') before?: string,
  ) {
    return this.service.inbox(identity(r), before);
  }
  @Get('notifications/:id') notice(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.notice(identity(r), id);
  }
  @Post('notifications/:id/read') read(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.read(identity(r), id);
  }
  @Post('notifications/:id/reply') reply(
    @Req() r: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() b: ReplyDto,
  ) {
    return this.service.reply(identity(r), id, b.answer);
  }
}
