import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Delegation } from './delegation.entity';
import { User } from 'src/users/user.entity';
import { MailService } from 'src/mail/mail.service';
import * as jwt from 'jsonwebtoken';
import { log } from 'node:console';


@Injectable()
export class DelegationService {
  constructor(
    @InjectRepository(Delegation)
    private readonly delegationRepository: Repository<Delegation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly mailService: MailService,
  ) {}


  async handleInvitation(email: string, agentId: string): Promise<any> {

    // Find the user by email
    const user = await this.userRepository.findOne({ where: { email } });

    // If no user is found, throw an error
    if (!user) {
      throw new NotFoundException(`No user found with the email: ${email}`);
    }

    // Find the agent by his firebaseId
    const agent = await this.userRepository.findOne({ where: { firebaseId: agentId } });

    // If no accountant is found, throw an error
    if (!agent) {
      throw new NotFoundException(`No accountant found with firebaseId: ${agentId}`);
    }

    // Send permission request email to the user
    await this.sendPermissionRequestEmail(user, agent);

    return {
      message: `Permission request sent to user with email: ${email}`
    };
 
  }


  private async sendPermissionRequestEmail(user: any, agent: any): Promise<void> {

    const token = await this.generateDelegationToken(user.firebaseId, agent.firebaseId);
    const approveLink = `https://${process.env.APP_URL}/delegations/approve-delegation?token=${token}`;
  
    const emailContent = `
      Dear ${user.name},
  
      ${agent.name} has requested access to your account. 
      You can approve the request using the following link:

      ${approveLink}
  
      Thank you.
    `;
  
    await this.mailService.sendMail(user.email, 'Permission Request', emailContent);
  }


  private async generateDelegationToken( userId: string, agentId: string): Promise<string> {
    const payload = { userId, agentId };
    const secret = process.env.JWT_SECRET;
    return jwt.sign(payload, secret);
  }


  async grantPermission(delegationToken: string): Promise<{ success: boolean; message: string }> {

    const secret = process.env.JWT_SECRET;

    // Verify and decode the token
    let payload;
    try {
      payload = jwt.verify(delegationToken, secret);
    } catch (error) {
      console.error('JWT verification error:', error.message);
      throw new UnauthorizedException('Invalid or expired token');
    }
    const { userId, agentId } = payload;

    // Create and save the delegation entry
    try {
      const delegation = this.delegationRepository.create({
        userId,
        agentId,
      });
      await this.delegationRepository.save(delegation);
      return {
        success: true,
        message: `Delegation created successfully`,
      };
    } catch (error) {
      console.error('Database error:', error.message);
      throw new Error('Failed to save delegation to the database');
    }
  }


  async getUsersForAgent(agentFirebaseId: string): Promise<{ fullName: string; firebaseId: string }[]> {

    // Step 1: Query delegations for the given agent
    const delegations = await this.delegationRepository.find({
      where: { agentId: agentFirebaseId },
    });
  
    // Step 2: Extract userFirebaseIds from delegations
    const userFirebaseIds = delegations.map((delegation) => delegation.userId);
  
    if (userFirebaseIds.length === 0) {
      return []; // Return an empty array if no delegations exist for this agent
    }
  
    // Step 3: Use `findBy` with `In` to fetch user entities
    const users = await this.userRepository.findBy({
      firebaseId: In(userFirebaseIds),
    });
  
    // Step 4: Map the results to include fullName and firebaseId
    return users.map((user) => ({
      fullName: `${user.fName} ${user.lName}`, // Concatenate fName and lName
      firebaseId: user.firebaseId,            // Include firebaseId
    }));
  }


}