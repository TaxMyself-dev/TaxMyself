import {
  Injectable,
  InternalServerErrorException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { User } from '../users/user.entity';
import { Delegation, DelegationStatus } from '../delegation/delegation.entity';
import { Agents, AgentStatus } from '../delegation/agents.entity';
import { Business } from '../business/business.entity';
import { RegisterCustomerDto } from './dtos/register-customer.dto';
import { CreateDocDto } from '../documents/dtos/create-doc.dto';
import { DocumentsService } from '../documents/documents.service';
import {
  UserRole,
  FamilyStatus,
  EmploymentType,
  PayStatus,
  ModuleName,
  BusinessStatus,
  Gender,
  BusinessType,
  VATReportingType,
  TaxReportingType,
} from '../enum';

@Injectable()
export class AgentsService {
  private readonly firebaseAuth: admin.auth.Auth;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Delegation)
    private readonly delegationRepository: Repository<Delegation>,
    @InjectRepository(Agents)
    private readonly agentsRepository: Repository<Agents>,
    @InjectRepository(Business)
    private readonly businessRepository: Repository<Business>,
    private readonly documentsService: DocumentsService,
  ) {
    this.firebaseAuth = admin.auth();
  }

  /**
   * Register a customer via agent
   * Creates Firebase user, local User, and Delegation
   */
  async registerCustomer(
    agentId: number,
    externalCustomerId: string,
    dto: RegisterCustomerDto,
  ): Promise<{
    created: boolean;
    externalCustomerId: string;
    firebaseId: string;
  }> {
    // 1. Check existing mapping
    const existingDelegation = await this.delegationRepository.findOne({
      where: {
        agentId: agentId.toString(),
        externalCustomerId,
        status: DelegationStatus.ACTIVE,
      },
    });

    if (existingDelegation) {
      return {
        created: false,
        externalCustomerId,
        firebaseId: existingDelegation.userId,
      };
    }

    let firebaseId: string;
    let firebaseUser: admin.auth.UserRecord;

    // 2. Create or get Firebase user
    try {
      // Try to create Firebase user
      const displayName = dto.fName && dto.lName 
        ? `${dto.fName} ${dto.lName}`.trim()
        : undefined;

      // Build Firebase user creation object - email only (no phone)
      const createUserData: any = {
        email: dto.email,
        displayName,
        emailVerified: false,
      };

      // Note: Phone number is not included in Firebase user creation
      // Firebase registration is by email only

      firebaseUser = await this.firebaseAuth.createUser(createUserData);
      firebaseId = firebaseUser.uid;
    } catch (error) {
      // If user already exists, fetch by email
      if (error.code === 'auth/email-already-exists') {
        try {
          firebaseUser = await this.firebaseAuth.getUserByEmail(dto.email);
          firebaseId = firebaseUser.uid;
        } catch (getUserError) {
          throw new InternalServerErrorException(
            `Failed to get existing Firebase user: ${getUserError.message}`,
          );
        }
      } else {
        throw new InternalServerErrorException(
          `Failed to create Firebase user: ${error.message}`,
        );
      }
    }

    // 3. Create or update local User
    let localUser = await this.userRepository.findOne({
      where: { firebaseId },
    });

    if (!localUser) {
      // Determine business status based on whether business info is provided
      let businessStatus = BusinessStatus.NO_BUSINESS;
      if (dto.businessName && dto.businessNumber && dto.businessType) {
        businessStatus = BusinessStatus.SINGLE_BUSINESS;
      }

      // Create new local user with defaults
      const newUser = this.userRepository.create({
        firebaseId,
        email: dto.email,
        id: dto.id, // ID is mandatory
        phone: dto.phone || '',
        fName: dto.fName || '',
        lName: dto.lName || '',
        city: dto.city || '', // מקום מגורים (אופציונלי)
        gender: Gender.MALE,
        dateOfBirth: new Date(),
        employmentStatus: EmploymentType.SELF_EMPLOYED,
        familyStatus: FamilyStatus.SINGLE,
        role: [UserRole.REGULAR],
        finsiteId: '0',
        createdAt: new Date(),
        subscriptionEndDate: new Date(),
        payStatus: PayStatus.TRIAL,
        modulesAccess: [ModuleName.INVOICES, ModuleName.OPEN_BANKING],
        businessStatus,
      });

      // Set subscription end date to 2 months from now
      newUser.subscriptionEndDate.setMonth(
        newUser.subscriptionEndDate.getMonth() + 2,
      );

      localUser = await this.userRepository.save(newUser);
    } else {
      // Update existing user if needed (idempotent)
      if (dto.id && !localUser.id) {
        localUser.id = dto.id;
      }
      if (dto.fName && !localUser.fName) {
        localUser.fName = dto.fName;
      }
      if (dto.lName && !localUser.lName) {
        localUser.lName = dto.lName;
      }
      if (dto.phone && !localUser.phone) {
        localUser.phone = dto.phone;
      }
      if (dto.city && !localUser.city) {
        localUser.city = dto.city;
      }
      await this.userRepository.save(localUser);
    }

    // 3.5. Create Business if business info is provided
    if (dto.businessName && dto.businessNumber && dto.businessType) {
      // Check if business already exists for this user
      const existingBusiness = await this.businessRepository.findOne({
        where: {
          firebaseId,
          businessNumber: dto.businessNumber,
        },
      });

      if (!existingBusiness) {
        const newBusiness = this.businessRepository.create({
          firebaseId,
          businessName: dto.businessName,
          businessNumber: dto.businessNumber,
          businessType: dto.businessType,
          businessAddress: dto.businessAddress || null, // כתובת העסק (חובה)
          businessPhone: dto.phone || null,
          businessEmail: dto.email || null,
        });

        // Set VAT & tax reporting types based on business type
        switch (dto.businessType) {
          case BusinessType.EXEMPT:
            newBusiness.vatReportingType = VATReportingType.NOT_REQUIRED;
            newBusiness.taxReportingType = TaxReportingType.DUAL_MONTH_REPORT;
            break;

          case BusinessType.LICENSED:
          case BusinessType.COMPANY:
            newBusiness.vatReportingType = VATReportingType.DUAL_MONTH_REPORT;
            newBusiness.taxReportingType = TaxReportingType.DUAL_MONTH_REPORT;
            break;

          default:
            newBusiness.vatReportingType = VATReportingType.NOT_REQUIRED;
            newBusiness.taxReportingType = TaxReportingType.NOT_REQUIRED;
            break;
        }

        await this.businessRepository.save(newBusiness);
      }
    }

    // 4. Create Delegation
    try {
      const delegation = this.delegationRepository.create({
        userId: firebaseId,
        agentId: agentId.toString(),
        externalCustomerId,
        status: DelegationStatus.ACTIVE,
        scopes: ['DOCUMENTS_READ', 'DOCUMENTS_WRITE'],
      });

      await this.delegationRepository.save(delegation);
    } catch (error) {
      // If unique constraint violated, treat as existing mapping
      if (error.code === 'ER_DUP_ENTRY' || error.message.includes('unique')) {
        const existing = await this.delegationRepository.findOne({
          where: {
            agentId: agentId.toString(),
            externalCustomerId,
          },
        });

        if (existing) {
          return {
            created: false,
            externalCustomerId,
            firebaseId: existing.userId,
          };
        }
      }
      throw new InternalServerErrorException(
        `Failed to create delegation: ${error.message}`,
      );
    }

    return {
      created: true,
      externalCustomerId,
      firebaseId,
    };
  }

  /**
   * Add a new agent (admin only)
   * Generates API credentials and stores them securely
   * @param name - Agent name (e.g., "Focus")
   * @returns Agent with plaintext apiKey and secret (one-time only)
   */
  async addAgent(name: string): Promise<{
    id: number;
    name: string;
    status: string;
    apiKey: string;
    secret: string;
    createdAt: Date;
  }> {
    // Validate name (trim, non-empty)
    const trimmedName = name?.trim();
    if (!trimmedName || trimmedName === '') {
      throw new BadRequestException('Name is required and cannot be empty');
    }

    // Validate encryption key exists
    const encKeyBase64 = process.env.AGENT_SECRETS_ENC_KEY_BASE64;
    if (!encKeyBase64) {
      throw new BadRequestException('AGENT_SECRETS_ENC_KEY_BASE64 environment variable is not set');
    }

    // Decode encryption key
    let encKey: Buffer;
    try {
      encKey = Buffer.from(encKeyBase64, 'base64');
      if (encKey.length !== 32) {
        throw new BadRequestException('AGENT_SECRETS_ENC_KEY_BASE64 must be exactly 32 bytes (base64 encoded)');
      }
    } catch (error) {
      throw new BadRequestException(`Invalid AGENT_SECRETS_ENC_KEY_BASE64: ${error.message}`);
    }

    // Generate apiKey (32 bytes base64url)
    const apiKeyBytes = crypto.randomBytes(32);
    const apiKey = this.base64UrlEncode(apiKeyBytes);

    // Generate secret (32 bytes base64url)
    const secretBytes = crypto.randomBytes(32);
    const secret = this.base64UrlEncode(secretBytes);

    // Hash apiKey with SHA-256
    const apiKeyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    // Encrypt secret with AES-256-GCM
    const encryptedHmacSecret = this.encryptAES256GCM(secret, encKey);

    // Insert into Agents table with status ACTIVE
    const agent = this.agentsRepository.create({
      name: trimmedName,
      status: AgentStatus.ACTIVE,
      apiKeyHash,
      encryptedHmacSecret,
    });

    const savedAgent = await this.agentsRepository.save(agent);

    // Return response with plaintext apiKey and secret (one-time only)
    return {
      id: savedAgent.id,
      name: savedAgent.name,
      status: savedAgent.status,
      apiKey, // Plaintext - shown only once
      secret, // Plaintext - shown only once
      createdAt: savedAgent.createdAt,
    };
  }

  /**
   * Base64url encoding (URL-safe base64)
   */
  private base64UrlEncode(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Encrypt data using AES-256-GCM
   */
  private encryptAES256GCM(plaintext: string, key: Buffer): string {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key as any, iv as any);

    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    const authTag = cipher.getAuthTag();

    // Combine IV + authTag + encrypted data
    // Format: base64(iv:12bytes + authTag:16bytes + encrypted)
    const encryptedBuffer = Buffer.from(encrypted, 'base64');
    const combined = Buffer.concat([iv as any, authTag as any, encryptedBuffer as any]);
    return combined.toString('base64');
  }

  /**
   * Create a document on behalf of a customer via agent
   * @param agentId - Agent ID
   * @param externalCustomerId - External customer ID
   * @param createDocDto - Document creation data
   * @returns Created document result
   */
  async createDocumentForCustomer(
    agentId: number,
    externalCustomerId: string,
    createDocDto: CreateDocDto,
  ): Promise<any> {
    // 1. Find delegation to get firebaseId
    const delegation = await this.delegationRepository.findOne({
      where: {
        agentId: agentId.toString(),
        externalCustomerId,
        status: DelegationStatus.ACTIVE,
      },
    });

    if (!delegation) {
      throw new BadRequestException(
        `No active delegation found for agent ${agentId} and customer ${externalCustomerId}`,
      );
    }

    // 2. Check if agent has DOCUMENTS_WRITE permission
    const hasWritePermission = delegation.scopes?.includes('DOCUMENTS_WRITE');
    if (!hasWritePermission) {
      throw new BadRequestException(
        `Agent does not have DOCUMENTS_WRITE permission for customer ${externalCustomerId}`,
      );
    }

    // 3. Get firebaseId from delegation
    const firebaseId = delegation.userId;

    // 4. Transform document data
    const transformedData = await this.documentsService.transformDocumentData(createDocDto);

    // 5. Create document using the existing service method
    const result = await this.documentsService.createDoc(transformedData, firebaseId);

    return result;
  }
}

