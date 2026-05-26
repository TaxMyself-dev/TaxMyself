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
  VATReportingType,
  TaxReportingType,
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

  /**
   * Get list of users who have view (or other) permission on the current user's data.
   * Delegations where userId = ownerFirebaseId.
   */
  async getDelegationsForOwner(ownerFirebaseId: string): Promise<{
    agentId: string;
    email: string;
    fullName: string;
    scopes: string[];
  }[]> {
    const delegations = await this.delegationRepository.find({
      where: { userId: ownerFirebaseId, status: DelegationStatus.ACTIVE },
    });
    if (delegations.length === 0) return [];
    const agentIds = delegations.map((d) => d.agentId);
    const agents = await this.userRepository.find({
      where: { firebaseId: In(agentIds) },
      select: ['firebaseId', 'email', 'fName', 'lName'],
    });
    const agentByFirebaseId = new Map(agents.map((a) => [a.firebaseId, a]));
    return delegations.map((d) => {
      const agent = agentByFirebaseId.get(d.agentId);
      return {
        agentId: d.agentId,
        email: agent?.email ?? '',
        fullName: ([agent?.fName, agent?.lName].filter(Boolean).join(' ').trim() || agent?.email) ?? '',
        scopes: d.scopes ?? [],
      };
    });
  }

  /**
   * Grant view-only permission to an existing user by email.
   * Owner = current user; the user with the given email gets DOCUMENTS_READ.
   * Sends email to the user that view permission was granted.
   */
  async grantViewPermissionByEmail(
    ownerFirebaseId: string,
    email: string,
  ): Promise<{ message: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const agent = await this.userRepository.findOne({
      where: { email: normalizedEmail },
    });
    if (!agent) {
      throw new NotFoundException('המשתמש לא קיים במערכת');
    }
    const existing = await this.delegationRepository.findOne({
      where: { userId: ownerFirebaseId, agentId: agent.firebaseId },
    });
    if (existing) {
      return { message: 'למשתמש זה כבר ניתנה הרשאה' };
    }
    const owner = await this.userRepository.findOne({
      where: { firebaseId: ownerFirebaseId },
      select: ['fName', 'lName', 'email'],
    });
    const ownerName = owner
      ? [owner.fName, owner.lName].filter(Boolean).join(' ').trim() || owner.email
      : 'משתמש';
    const delegation = this.delegationRepository.create({
      userId: ownerFirebaseId,
      agentId: agent.firebaseId,
      status: DelegationStatus.ACTIVE,
      scopes: ['DOCUMENTS_READ'],
    });
    await this.delegationRepository.save(delegation);
    await this.sendViewPermissionGrantedEmail(agent, ownerName);
    return { message: 'ההרשאה ניתנה בהצלחה' };
  }

  private async sendViewPermissionGrantedEmail(
    agent: { email: string; fName?: string; lName?: string },
    ownerName: string,
  ): Promise<void> {
    const appUrl = process.env.FRONTEND_URL ?? 'https://app.keepintax.co.il';
    const subject = 'ניתנה לך הרשאה לצפייה';
    const greeting = agent.fName ? `שלום ${agent.fName},` : 'שלום,';
    const bodyLine = `ניתנה לך הרשאה לצפייה בחשבון Keepintax של ${ownerName}.`;
    const linkLine = `לכניסה למערכת לחץ כאן: <a href="${appUrl}">${appUrl}</a>`;
    const text = `${greeting}\n\n${bodyLine}\n\nלכניסה למערכת: ${appUrl}\n\nתודה.`;
    const htmlContent = this.buildRtlEmailHtml([greeting, '', bodyLine, '', linkLine, '', 'תודה.']);
    await this.mailService.sendMail(agent.email, subject, text, htmlContent);
  }

  /** בונה HTML למייל בעברית עם כיוון RTL */
  private buildRtlEmailHtml(paragraphs: string[]): string {
    const body = paragraphs
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed) return '<br>';
        return `<p dir="rtl" style="direction: rtl; text-align: right; unicode-bidi: embed; margin: 10px 0;">${trimmed}</p>`;
      })
      .join('');
    return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <style>
    * { direction: rtl; text-align: right; }
    body { font-family: Arial, Helvetica, sans-serif; direction: rtl; text-align: right; margin: 0; padding: 20px; }
    p { direction: rtl; text-align: right; margin: 10px 0; unicode-bidi: embed; }
  </style>
</head>
<body>
  <div dir="rtl" style="direction: rtl; text-align: right; unicode-bidi: embed;">${body}</div>
</body>
</html>`;
  }


  /**
   * Returns one row per (user, business) for the accountant's clients.
   * When a user has granted permission, the accountant sees all businesses under that user.
   * If a user has no businesses, one row is still returned with user data and null business fields.
   */
  async getUsersForAgent(agentFirebaseId: string): Promise<{
    firebaseId: string;
    fullName: string;
    fName: string;
    lName: string;
    id: string;
    businessType: BusinessType | null;
    email: string;
    businessId: number | null;
    businessNumber: string | null;
    businessName: string | null;
    vatReportingType: VATReportingType | null;
    taxReportingType: TaxReportingType | null;
    nationalInsRequired: boolean | null;
  }[]> {
    const delegations = await this.delegationRepository.find({
      where: { agentId: agentFirebaseId, status: DelegationStatus.ACTIVE },
    });
    const userFirebaseIds = delegations.map((d) => d.userId);
    if (userFirebaseIds.length === 0) return [];

    const users = await this.userRepository.findBy({
      firebaseId: In(userFirebaseIds),
    });
    const userByFirebaseId = new Map(users.map((u) => [u.firebaseId, u]));

    const businesses = await this.businessRepository.find({
      where: { firebaseId: In(userFirebaseIds) },
      select: ['id', 'firebaseId', 'businessType', 'businessNumber', 'businessName', 'vatReportingType', 'taxReportingType', 'nationalInsRequired'],
    });
    const businessesByFirebaseId = new Map<string, typeof businesses>();
    for (const b of businesses) {
      const list = businessesByFirebaseId.get(b.firebaseId) ?? [];
      list.push(b);
      businessesByFirebaseId.set(b.firebaseId, list);
    }

    const rows: {
      firebaseId: string;
      fullName: string;
      fName: string;
      lName: string;
      id: string;
      businessType: BusinessType | null;
      email: string;
      businessId: number | null;
      businessNumber: string | null;
      businessName: string | null;
      vatReportingType: VATReportingType | null;
      taxReportingType: TaxReportingType | null;
      nationalInsRequired: boolean | null;
    }[] = [];

    for (const user of users) {
      const fullName = `${user.fName || ''} ${user.lName || ''}`.trim() || user.email;
      const base = {
        firebaseId: user.firebaseId,
        fullName,
        fName: user.fName || '',
        lName: user.lName || '',
        id: user.id || '',
        email: user.email || '',
      };
      const userBusinesses = businessesByFirebaseId.get(user.firebaseId) ?? [];
      if (userBusinesses.length === 0) {
        rows.push({
          ...base,
          businessType: null,
          businessId: null,
          businessNumber: null,
          businessName: null,
          vatReportingType: null,
          taxReportingType: null,
          nationalInsRequired: null,
        });
      } else {
        for (const b of userBusinesses) {
          rows.push({
            ...base,
            businessType: b.businessType ?? null,
            businessId: b.id,
            businessNumber: b.businessNumber ?? null,
            businessName: b.businessName ?? null,
            vatReportingType: b.vatReportingType ?? null,
            taxReportingType: b.taxReportingType ?? null,
            nationalInsRequired: b.nationalInsRequired ?? null,
          });
        }
      }
    }
    return rows;
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
    const resolvedBusinessType = dto.businessType ?? BusinessType.EXEMPT;
    const vatDefault = resolvedBusinessType === BusinessType.EXEMPT
      ? VATReportingType.NOT_REQUIRED
      : VATReportingType.DUAL_MONTH_REPORT;
    const business = this.businessRepository.create({
      firebaseId,
      businessName: dto.businessName?.trim() ?? null,
      businessNumber: dto.businessNumber?.trim() ?? null,
      businessType: resolvedBusinessType,
      businessAddress: addressOrCity || null,
      businessPhone: dto.phone?.trim() ?? null,
      businessEmail: dto.email.trim() || null,
      vatReportingType: vatDefault,
      taxReportingType: TaxReportingType.DUAL_MONTH_REPORT,
      nationalInsRequired: false,
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