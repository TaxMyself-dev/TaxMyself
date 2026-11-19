import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { AgentHarnessUser } from '../agent-harness/agent-harness.service';
import { OnboardingService } from './onboarding.service';
class VersionDto {
  @IsInt() person: number;
  @IsInt() business: number;
}
class ProposeDto {
  @IsString() @MaxLength(100) businessNumber: string;
  @ValidateNested() @Type(() => VersionDto) version: VersionDto;
  @IsOptional() @IsString() @MaxLength(12000) message?: string;
  @IsOptional() @IsString() @MaxLength(40) skipField?: string;
  @IsOptional() @IsString() @MaxLength(40) guidedField?: string;
}
class CommitDto {
  @IsString() @MaxLength(100) businessNumber: string;
  @IsUUID() proposalId: string;
}
class ScopeDto {
  @IsString() @MaxLength(100) businessNumber: string;
}
class ForgetDto extends ScopeDto {
  @IsUUID() factId: string;
  @ValidateNested() @Type(() => VersionDto) version: VersionDto;
}
function identity(req: AuthenticatedRequest): AgentHarnessUser {
  return {
    actorFirebaseId: req.user.actorFirebaseId ?? req.user.firebaseId,
    firebaseId: req.user.firebaseId,
    businessNumber: null,
    delegationScopes: req.user.delegationScopes ?? [],
    isDelegatedAccess: req.isDelegatedAccess === true,
    isAdminImpersonation: req.isAdminImpersonation === true,
  };
}
@Controller('api/agent-profile')
@UseGuards(FirebaseAuthGuard)
export class OnboardingController {
  constructor(private readonly service: OnboardingService) {}
  @Get('businesses') businesses(@Req() req: AuthenticatedRequest) {
    return this.service.businesses(identity(req));
  }
  @Get() read(
    @Req() req: AuthenticatedRequest,
    @Query('businessNumber') business?: string,
  ) {
    return this.service.read(identity(req), business);
  }
  @Post('propose') propose(
    @Req() req: AuthenticatedRequest,
    @Body() body: ProposeDto,
  ) {
    return this.service.propose(identity(req), body);
  }
  @Post('commit') commit(
    @Req() req: AuthenticatedRequest,
    @Body() body: CommitDto,
  ) {
    return this.service.commit(
      identity(req),
      body.businessNumber,
      body.proposalId,
    );
  }
  @Post('defer') defer(
    @Req() req: AuthenticatedRequest,
    @Body() body: ScopeDto,
  ) {
    return this.service.defer(identity(req), body.businessNumber);
  }
  @Post('forget') forget(
    @Req() req: AuthenticatedRequest,
    @Body() body: ForgetDto,
  ) {
    return this.service.forget(
      identity(req),
      body.businessNumber,
      body.factId,
      body.version,
    );
  }
}
