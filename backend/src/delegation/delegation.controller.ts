import { Controller, Post, Delete, Get, Body, Req, Headers, UseGuards, Query, UnauthorizedException } from '@nestjs/common';
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
  async handleApproveDelegation(@Query('token') token: string): Promise<any> {
    
    const secret = process.env.JWT_SECRET;

    // Verify and decode the token
    let payload;
    try {
      payload = jwt.verify(token, secret) as { userFirebaseId: string; agentFirebaseId: string };
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const { userFirebaseId, agentFirebaseId } = payload;

    // Grant permission by creating a delegation entry
    await this.delegationService.grantPermission(userFirebaseId, agentFirebaseId);

    return {
      message: `Permission granted successfully for user ${userFirebaseId} to agent ${agentFirebaseId}`,
    };
}


  /**
   * Grant permission to a delegate
   * POST /delegations
   */
  @Post()
  async grantPermission(
    @Body('ownerId') ownerId: string, // User granting access
    @Body('delegateId') delegateId: string, // User receiving access
  ) {
    return this.delegationService.grantPermission(ownerId, delegateId);
  }

  /**
   * Revoke permission from a delegate
   * DELETE /delegations
   */
  @Delete()
  async revokePermission(
    @Body('ownerId') ownerId: string, // User revoking access
    @Body('delegateId') delegateId: string, // User losing access
  ) {
    await this.delegationService.revokePermission(ownerId, delegateId);
    return { message: 'Permission revoked successfully' };
  }

  /**
   * Get the list of users managed by a delegate
   * GET /delegations
   */
  @Get()
  async getManagedUsers(@Req() req) {
    const delegateId = req.user.id; // Get the authenticated user's ID from the request
    return this.delegationService.getUsersManagedBy(delegateId);
  }
}
