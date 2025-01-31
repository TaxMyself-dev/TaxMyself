import { Controller, Post, Delete, Get, Body, Req, Headers, UseGuards, Query, UnauthorizedException, Param } from '@nestjs/common';
import { DelegationService } from './delegation.service';
import { UsersService } from 'src/users/users.service';
import * as jwt from 'jsonwebtoken';
//import { AuthGuard } from '@nestjs/passport'; // Replace with your authentication guard

@Controller('delegations')
//@UseGuards(AuthGuard('jwt')) // Apply authentication guard
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

    return {
      message: `Users retrieved successfully`,
      users,
    };
    
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
