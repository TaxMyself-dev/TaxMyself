import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Headers,
  UseGuards,
  Query,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { DelegationService } from './delegation.service';
import { UsersService } from 'src/users/users.service';
import { FirebaseAuthGuard } from 'src/guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { CreateClientByAccountantDto } from './dtos/create-client-by-accountant.dto';

@Controller('delegations')
export class DelegationController {
  constructor(
    private readonly delegationService: DelegationService,
    private readonly usersService: UsersService,
  ) {}


  @Post('invite')
  async sendInvitation(
    @Body('email') email: string, 
    @Headers('token') token: string): Promise<any> {
      console.log("delegation invite - start");
      const userId = await this.usersService.getFirbsaeIdByToken(token);
      return this.delegationService.handleInvitation(email, userId);
  }


  @Get('approve-delegation')
  async ApproveDelegation(@Query('token') token: string): Promise<any> {

    const result = await this.delegationService.grantPermission(token);

    if (result.success) {
      return {
        message: result.message, // Provide a success message only
      };
    } else {
      throw new Error('Delegation failed'); // This would rarely trigger as exceptions are thrown for errors
    }

  }


  @Get('users-for-agent/:agentId')
  async getUsersForAgent(@Param('agentId') agentId: string): Promise<any> {
    const users = await this.delegationService.getUsersForAgent(agentId);
    return users;
  }

  /**
   * Create a new client by an accountant (רואה חשבון).
   * Requires: Bearer token, user must have role ACCOUNTANT.
   * Creates Firebase user (email + password = "KE" + phone), User in DB, and Delegation.
   */
  @Post('create-client')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createClient(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateClientByAccountantDto,
  ): Promise<{ firebaseId: string; fullName: string }> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) {
      throw new ForbiddenException('לא אותחל משתמש');
    }

    const isAccountant = await this.usersService.isAccountant(firebaseId);
    if (!isAccountant) {
      throw new ForbiddenException('גישה מותרת רק לרואה חשבון');
    }

    return this.delegationService.createClientByAccountant(firebaseId, dto);
  }

  /**
   * Remove a client from the accountant's list (delete delegation only).
   * Only the accountant who owns the delegation can delete it.
   */
  @Delete('client/:clientId')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteClient(
    @Req() request: AuthenticatedRequest,
    @Param('clientId') clientId: string,
  ): Promise<void> {
    const firebaseId = request.user?.firebaseId;
    if (!firebaseId) throw new ForbiddenException('לא אותחל משתמש');
    const isAccountant = await this.usersService.isAccountant(firebaseId);
    if (!isAccountant) throw new ForbiddenException('גישה מותרת רק לרואה חשבון');
    await this.delegationService.deleteClientByAccountant(firebaseId, clientId);
  }

  /**
   * Grant permission to a delegate
   * POST /delegations
   */
  // @Post()
  // async grantPermission(
  //   @Body('ownerId') ownerId: string, // User granting access
  //   @Body('delegateId') delegateId: string, // User receiving access
  // ) {
  //   return this.delegationService.grantPermission(ownerId, delegateId);
  // }

  /**
   * Revoke permission from a delegate
   * DELETE /delegations
   */
  // @Delete()
  // async revokePermission(
  //   @Body('ownerId') ownerId: string, // User revoking access
  //   @Body('delegateId') delegateId: string, // User losing access
  // ) {
  //   await this.delegationService.revokePermission(ownerId, delegateId);
  //   return { message: 'Permission revoked successfully' };
  // }

  /**
   * Get the list of users managed by a delegate
   * GET /delegations
   */
  // @Get()
  // async getManagedUsers(@Req() req) {
  //   const delegateId = req.user.id; // Get the authenticated user's ID from the request
  //   return this.delegationService.getUsersManagedBy(delegateId);
  // }
}
