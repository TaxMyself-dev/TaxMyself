import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import * as jwt from 'jsonwebtoken';
import { Delegation, DelegationStatus } from './delegation.entity';
import { User } from 'src/users/user.entity';
import { Business } from 'src/business/business.entity';
import { MailService } from 'src/mail/mail.service';
import { CreateClientByAccountantDto } from './dtos/create-client-by-accountant.dto';
import {
  UserRole,
  Gender,
  FamilyStatus,
  EmploymentType,
  PayStatus,
  BusinessStatus,
  BusinessType,
} from '../enum';

@Injectable()
export class DelegationService {
  private readonly firebaseAuth: admin.auth.Auth;

  constructor(
    @InjectRepository(Delegation)
    private readonly delegationRepository: Repository<Delegation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    private readonly mailService: MailService,
  ) {
    this.firebaseAuth = admin.auth();
  }


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


  async getUsersForAgent(agentFirebaseId: string): Promise<{
    firebaseId: string;
    fullName: string;
    fName: string;
    lName: string;
    id: string;
    businessType: BusinessType | null;
    email: string;
  }[]> {
    const delegations = await this.delegationRepository.find({
      where: { agentId: agentFirebaseId },
    });
    const userFirebaseIds = delegations.map((d) => d.userId);
    if (userFirebaseIds.length === 0) return [];

    const users = await this.userRepository.findBy({
      firebaseId: In(userFirebaseIds),
    });
    const businesses = await this.businessRepository.find({
      where: { firebaseId: In(userFirebaseIds) },
      select: ['firebaseId', 'businessType'],
    });
    const businessTypeByFirebaseId = new Map<string, BusinessType>();
    for (const b of businesses) {
      if (b.businessType && !businessTypeByFirebaseId.has(b.firebaseId)) {
        businessTypeByFirebaseId.set(b.firebaseId, b.businessType);
      }
    }
    return users.map((user) => ({
      firebaseId: user.firebaseId,
      fullName: `${user.fName || ''} ${user.lName || ''}`.trim() || user.email,
      fName: user.fName || '',
      lName: user.lName || '',
      id: user.id || '',
      businessType: businessTypeByFirebaseId.get(user.firebaseId) ?? null,
      email: user.email || '',
    }));
  }

  /**
   * Remove a client from the accountant's list (delete delegation only).
   * The User and Firebase account remain; only the delegation link is removed.
   */
  async deleteClientByAccountant(
    accountantFirebaseId: string,
    clientFirebaseId: string,
  ): Promise<void> {
    const delegation = await this.delegationRepository.findOne({
      where: { agentId: accountantFirebaseId, userId: clientFirebaseId },
    });
    if (!delegation) {
      throw new NotFoundException('לא נמצא קישור ללקוח זה');
    }
    await this.delegationRepository.remove(delegation);
  }

  /**
   * Create a new client by an accountant (רואה חשבון).
   * Creates: Firebase user (email + password = "KE" + phone), User in DB, Delegation record.
   * Ensures client does not already exist (by email).
   */
  async createClientByAccountant(
    accountantFirebaseId: string,
    dto: CreateClientByAccountantDto,
  ): Promise<{ firebaseId: string; fullName: string }> {
    // 1. Ensure client does not already exist (by email)
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email.trim().toLowerCase() },
    });
    if (existingUser) {
      throw new ConflictException(`העסק כבר קיים במערכת`);
    }

    const password = `KE${dto.phone.replace(/\D/g, '')}`;
    const displayName =
      dto.fName && dto.lName
        ? `${dto.fName.trim()} ${dto.lName.trim()}`
        : dto.email;

    let firebaseUser: admin.auth.UserRecord;

    // 2. Create Firebase user with email and password = "KE" + phone
    try {
      firebaseUser = await this.firebaseAuth.createUser({
        email: dto.email.trim(),
        password,
        displayName,
        emailVerified: false,
      });
    } catch (error: any) {
      if (error?.code === 'auth/email-already-exists') {
        throw new ConflictException(`העסק כבר קיים במערכת`);
      }
      throw new InternalServerErrorException(
        `יצירת משתמש בפיירבייס נכשלה: ${error?.message || error}`,
      );
    }

    const firebaseId = firebaseUser.uid;

    const dateOfBirth = dto.dateOfBirth
      ? new Date(dto.dateOfBirth)
      : new Date();
    const addressOrCity = dto.address?.trim() ?? '';

    // 3. Create User in DB (כתובת נשמרת בשדה city)
    const newUser = this.userRepository.create({
      firebaseId,
      email: dto.email.trim(),
      phone: dto.phone?.trim() ?? '',
      fName: dto.fName?.trim() ?? '',
      lName: dto.lName?.trim() ?? '',
      id: dto.id?.trim() ?? '',
      finsiteId: null,
      gender: Gender.MALE,
      dateOfBirth,
      city: addressOrCity,
      address: null,
      employmentStatus: EmploymentType.SELF_EMPLOYED,
      familyStatus: FamilyStatus.SINGLE,
      role: [UserRole.REGULAR],
      businessStatus: BusinessStatus.SINGLE_BUSINESS,
      payStatus: PayStatus.TRIAL,
      modulesAccess: null,
      createdAt: new Date(),
      subscriptionEndDate: new Date(),
    });
    newUser.subscriptionEndDate.setMonth(
      newUser.subscriptionEndDate.getMonth() + 2,
    );
    await this.userRepository.save(newUser);

    // 3b. יוצרים תמיד עסק בטבלת העסקים לפי השדות הרלוונטיים
    const business = this.businessRepository.create({
      firebaseId,
      businessName: dto.businessName?.trim() ?? null,
      businessNumber: dto.businessNumber?.trim() ?? null,
      businessType: dto.businessType ?? BusinessType.EXEMPT,
      businessAddress: addressOrCity || null,
      businessPhone: dto.phone?.trim() ?? null,
      businessEmail: dto.email.trim() || null,
    });
    await this.businessRepository.save(business);

    // 4. Create Delegation (accountant -> client)
    const delegation = this.delegationRepository.create({
      userId: firebaseId,
      agentId: accountantFirebaseId,
      externalCustomerId: null,
      status: DelegationStatus.ACTIVE,
      scopes: ['DOCUMENTS_READ', 'DOCUMENTS_WRITE'],
    });
    await this.delegationRepository.save(delegation);

    const fullName = `${newUser.fName} ${newUser.lName}`.trim() || dto.email;
    return { firebaseId, fullName };
  }
}