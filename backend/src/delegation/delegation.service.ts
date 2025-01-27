import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
    console.log("permission token is ", token);

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


  private async generateDelegationToken(accountantId: string, userId: string): Promise<string> {
    const payload = { accountantId, userId };
    const secret = process.env.JWT_SECRET; // Use a strong secret
    return jwt.sign(payload, secret);
  }


  async grantPermission(ownerId: string, delegateId: string, expiresAt?: Date): Promise<Delegation> {
    const delegation = this.delegationRepository.create({
      ownerId,
      delegateId
    });
    return this.delegationRepository.save(delegation);
  }

  async revokePermission(ownerId: string, delegateId: string): Promise<void> {
    await this.delegationRepository.delete({ ownerId, delegateId });
  }

  async getUsersManagedBy(delegateId: string): Promise<User[]> {
    const delegations = await this.delegationRepository.find({ where: { delegateId } });
    const ownerIds = delegations.map((d) => d.ownerId);
    return this.userRepository.findByIds(ownerIds); // Fetch user details for owners
  }
  

}