import { HttpException, HttpStatus, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Any, LessThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Child } from './child.entity';
import { UserRole, BusinessType, VATReportingType, TaxReportingType, FamilyStatus, EmploymentType, PayStatus, ModuleName, BusinessStatus, DocumentType } from '../enum';
import { AuthService } from './auth.service';
import * as admin from 'firebase-admin';
import { UpdateUserDto } from './dtos/update-user.dto';
import { SharedService } from 'src/shared/shared.service';
import { CityDto } from '../cities/city.dto';
import { cities } from '../cities/cities.data';
import { Business } from 'src/business/business.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';
import { UserModuleSubscription } from './user-module-subscription.entity';


@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  public defaultApp: any;
  private readonly firebaseAuth: admin.auth.Auth;

  constructor
    (
      private readonly sharedService: SharedService,
      @InjectRepository(User) private user_repo: Repository<User>,
      @InjectRepository(Business) private business_repo: Repository<Business>,
      @InjectRepository(Child) private child_repo: Repository<Child>,
      @InjectRepository(SettingDocuments)
      private readonly settingDocumentsRepo: Repository<SettingDocuments>,
      @InjectRepository(UserModuleSubscription)
      private readonly moduleSubRepo: Repository<UserModuleSubscription>,
    ) {
    this.firebaseAuth = admin.auth();
  }


  async signup({ personal, spouse, children, business }: any) {

    console.log("signup - start");

    console.log("🧍 personal:", personal);
    console.log("🤝 spouse:", spouse);
    console.log("👶 children:", children);
    console.log("🏢 business:", business);

    // -------------------------------------------------------
    // 1️⃣ SAFE NORMALIZATION
    // -------------------------------------------------------

    // spouse may be null/undefined
    const safeSpouse = spouse ?? {};

    // children may be undefined
    const newChildren = Array.isArray(children?.childrenArray)
      ? children.childrenArray
      : [];

    // businesses may be undefined
    const newBusinesses: Partial<Business>[] = Array.isArray(
      business?.businessArray,
    )
      ? business.businessArray
      : [];

    // -------------------------------------------------------
    // 2️⃣ Create the user object
    // -------------------------------------------------------
    const newUser = {
      ...personal,
      ...safeSpouse,
      role: [UserRole.REGULAR],
      finsiteId: 0,
      createdAt: new Date(),
      subscriptionEndDate: new Date(),
      payStatus: PayStatus.TRIAL,
      modulesAccess: [ModuleName.INVOICES, ModuleName.OPEN_BANKING],
    };

    newUser.subscriptionEndDate.setMonth(
      newUser.subscriptionEndDate.getMonth() + 2,
    );

    // -------------------------------------------------------
    // 3️⃣ Business status logic
    // -------------------------------------------------------
    if (newBusinesses.length === 0) {
      newUser.businessStatus = BusinessStatus.NO_BUSINESS;
    } else if (newBusinesses.length === 1) {
      newUser.businessStatus = BusinessStatus.SINGLE_BUSINESS;
    } else {
      newUser.businessStatus = BusinessStatus.MULTI_BUSINESS;
    }

    // -------------------------------------------------------
    // 4️⃣ Save user
    // -------------------------------------------------------
    const user = this.user_repo.create(newUser);
    const savedUser = (await this.user_repo.save(user)) as unknown as User;

    // -------------------------------------------------------
    // 5️⃣ Create INVOICES module subscription (for users with a business)
    // -------------------------------------------------------
    if (savedUser.businessStatus !== BusinessStatus.NO_BUSINESS) {
      const trialStart = new Date();
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 45);
      await this.moduleSubRepo.save(
        this.moduleSubRepo.create({
          firebaseId: savedUser.firebaseId,
          moduleName: ModuleName.INVOICES,
          trialStartDate: trialStart,
          trialEndDate: trialEnd,
          payStatus: PayStatus.TRIAL,
          monthlyPriceNis: 15,
          createdAt: new Date(),
        }),
      );
    }

    // -------------------------------------------------------
    // 7️⃣ Save children
    // -------------------------------------------------------
    for (const child of newChildren) {
      const newChild = this.child_repo.create({
        ...child,
        parentUserID: personal.firebaseId,
      });

      await this.child_repo.save(newChild);
    }

    // -------------------------------------------------------
    // 8️⃣ Save businesses
    // -------------------------------------------------------
    for (const biz of newBusinesses) {
      if (!biz) continue;

      const newBusiness = this.business_repo.create({
        ...biz,
        firebaseId: personal.firebaseId,
      });

      // Fill null business fields from personal or spouse data
      // Check if businessNumber matches personal.id or spouse.id
      const businessNumber = newBusiness.businessNumber;
      const personalId = personal?.id;
      const spouseId = safeSpouse?.spouseId || safeSpouse?.id;

      if (businessNumber && (businessNumber === personalId || businessNumber === spouseId)) {
        // Determine source: personal or spouse
        const isPersonalMatch = businessNumber === personalId;

        // Fill null business fields from source
        if (!newBusiness.businessPhone) {
          if (isPersonalMatch && personal?.phone) {
            newBusiness.businessPhone = personal.phone;
          } else if (!isPersonalMatch && safeSpouse?.spousePhone) {
            newBusiness.businessPhone = safeSpouse.spousePhone;
          }
        }

        if (!newBusiness.businessEmail) {
          if (isPersonalMatch && personal?.email) {
            newBusiness.businessEmail = personal.email;
          } else if (!isPersonalMatch && safeSpouse?.spouseEmail) {
            newBusiness.businessEmail = safeSpouse.spouseEmail;
          }
        }

        // For address, use city if available
        if (!newBusiness.businessAddress) {
          if (isPersonalMatch && personal?.city) {
            newBusiness.businessAddress = personal.city;
          } else if (!isPersonalMatch && safeSpouse?.city) {
            newBusiness.businessAddress = safeSpouse.city;
          }
        }

        // For business name, use person's name if not provided
        if (!newBusiness.businessName) {
          if (isPersonalMatch && personal?.fName && personal?.lName) {
            newBusiness.businessName = `${personal.fName} ${personal.lName}`;
          } else if (!isPersonalMatch && safeSpouse?.spouseFName && safeSpouse?.spouseLName) {
            newBusiness.businessName = `${safeSpouse.spouseFName} ${safeSpouse.spouseLName}`;
          }
        }
      }

      // VAT & tax logic
      switch (newBusiness.businessType) {
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

      await this.business_repo.save(newBusiness);
    }

    console.log("signup - end");
    return savedUser;
  }


  async signin(firebaseId: string) {
    const user = await this.findFireUser(firebaseId);
    return user;
  }


  async updateUser(userId: string, updateUserDto: UpdateUserDto): Promise<User> {

    const user = await this.user_repo.findOneBy({ firebaseId: userId });
    if (!user) {
      throw new Error('User not found');
    }

    // Convert date fields to timestamps
    const processedUserData = this.processDateFields(updateUserDto);

    // Assign updated fields to the user entity
    Object.assign(user, processedUserData);
    return this.user_repo.save(user);

  }


  private processDateFields(updateUserDto: any): any {

    const dateFields = ['dateOfBirth', 'businessDate', 'spouseDateOfBirth'];  // List of fields expected to be dates
    const processedData = { ...updateUserDto };

    for (const key in processedData) {
      if (processedData.hasOwnProperty(key) && dateFields.includes(key)) {
        console.log("convert to date: ", key);
        processedData[key] = this.sharedService.convertStringToDateObject(processedData[key]);
        console.log("after convert: ", processedData[key]);
      }
    }

    return processedData;
  }


  // async findFireUser(firebaseId: string) {
  //   console.log("🚀 ~ UsersService ~ findFireUser ~ firebaseId:", firebaseId)
  //   const x = await this.user_repo.findOne({ where: { firebaseId } })
  //   console.log("🚀 ~ UsersService ~ findFireUser ~ x:", x)
  //   return x
  // }
  async findFireUser(firebaseId: string) {
    const maskedId = firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : firebaseId ?? '?';
    this.logger.log(`findFireUser called, firebaseId=${maskedId}`);
    try {
      this.logger.log(`findFireUser: querying DB for firebaseId=${maskedId}`);
      const user = await this.user_repo.findOne({
        where: { firebaseId },
      });

      if (!user) {
        throw new NotFoundException(
          `User with firebaseId ${firebaseId} not found`
        );
      }

      return user;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      this.logger.error(
        `findFireUser failed for firebaseId=${firebaseId}: ${error?.message ?? error}`,
        (error as Error)?.stack,
      );
      throw new InternalServerErrorException(
        'Failed to fetch user'
      );
    }
  }


  async findByFirebaseId(firebaseId: string): Promise<User | null> {
    return this.user_repo.findOne({ where: { firebaseId } });
  }

  async getChildren(firebaseId: string): Promise<Child[]> {
    return this.child_repo.find({ where: { parentUserID: firebaseId }, order: { index: 'ASC' } });
  }

  async updateChildren(firebaseId: string, children: Array<{ childFName: string; childLName: string; childDate: string }>): Promise<Child[]> {
    await this.child_repo.delete({ parentUserID: firebaseId });
    const saved: Child[] = [];
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      if (!c?.childFName?.trim() && !c?.childLName?.trim()) continue;
      const child = this.child_repo.create({
        childFName: c.childFName?.trim() ?? '',
        childLName: c.childLName?.trim() ?? '',
        childID: null,
        childDate: c.childDate ?? '',
        parentUserID: firebaseId,
      });
      const s = await this.child_repo.save(child);
      saved.push(s);
    }
    return saved;
  }

  async deleteChild(firebaseId: string, childIndex: number): Promise<void> {
    const child = await this.child_repo.findOne({ where: { index: childIndex, parentUserID: firebaseId } });
    if (!child) {
      throw new NotFoundException('Child not found or not owned by user');
    }
    await this.child_repo.remove(child);
  }


  async getFirbsaeIdByToken(token: string): Promise<string> {
    let uid: string;
    try {
      if (token != null && token != '') {
        const firebaseUserData = await this.firebaseAuth.verifyIdToken(token);
        uid = firebaseUserData.uid;
        if (uid != null && uid != '') {
          return uid
        } else {
          throw new HttpException({
            status: HttpStatus.UNAUTHORIZED,
            error: `invalid user`
          }, HttpStatus.UNAUTHORIZED);
        }
      } else {
        throw new HttpException({
          status: HttpStatus.UNAUTHORIZED,
          error: `invalid user`
        }, HttpStatus.UNAUTHORIZED);
      }
    } catch (error) {
      throw new HttpException({
        status: HttpStatus.UNAUTHORIZED,
        error: `invalid user`
      }, HttpStatus.UNAUTHORIZED);

    }
  }


  async isAdmin(userId: string): Promise<boolean> {
    const user = await this.user_repo.findOneBy({ firebaseId: userId });
    return user?.role?.includes(UserRole.ADMIN) || false;
  }

  /**
   * Check if the user (by Firebase UID) has the ACCOUNTANT role.
   * Used to authorize "create client" and office panel access.
   */
  async isAccountant(firebaseId: string): Promise<boolean> {
    const user = await this.user_repo.findOneBy({ firebaseId });
    return user?.role?.includes(UserRole.ACCOUNTANT) || false;
  }


  async updateExpiredTrials(): Promise<void> {
    const today = new Date();

    // Legacy: update users with expired subscriptionEndDate
    const expiredUsers = await this.user_repo.find({
      where: {
        payStatus: PayStatus.TRIAL,
        subscriptionEndDate: LessThan(today),
      },
    });

    for (const user of expiredUsers) {
      user.payStatus = PayStatus.PAYMENT_REQUIRED;
      await this.user_repo.save(user);
      console.log(`Updated user ${user.id} from TRIAL to PAYMENT_REQUIRED`);
    }

    // Per-module: update UserModuleSubscription records with expired trial
    const expiredSubs = await this.moduleSubRepo.find({
      where: {
        payStatus: PayStatus.TRIAL,
        trialEndDate: LessThan(today),
      },
    });

    for (const sub of expiredSubs) {
      sub.payStatus = PayStatus.PAYMENT_REQUIRED;
      await this.moduleSubRepo.save(sub);
      console.log(`Updated module subscription id=${sub.id} (${sub.moduleName}) for firebaseId=${sub.firebaseId} from TRIAL to PAYMENT_REQUIRED`);

      // Remove module from user's modulesAccess so SubscriptionGuard blocks access
      const user = await this.user_repo.findOne({ where: { firebaseId: sub.firebaseId } });
      if (user?.modulesAccess?.includes(sub.moduleName)) {
        user.modulesAccess = user.modulesAccess.filter(m => m !== sub.moduleName);
        await this.user_repo.save(user);
        console.log(`Removed ${sub.moduleName} from modulesAccess for firebaseId=${sub.firebaseId}`);
      }
    }
  }

  async getModuleSubscription(firebaseId: string, moduleName: ModuleName): Promise<UserModuleSubscription | null> {
    return this.moduleSubRepo.findOne({ where: { firebaseId, moduleName } });
  }

  async getBillingStatus(firebaseId: string): Promise<{
    modules: { moduleName: ModuleName; payStatus: PayStatus; trialEndDate: Date; monthlyPriceNis: number }[];
    monthlyTotalNis: number;
    hasCombinedDiscount: boolean;
    discountPercent: number;
    discountLabel: string | null;
    finalAmountNis: number;
  }> {
    const [subs, user] = await Promise.all([
      this.moduleSubRepo.find({ where: { firebaseId } }),
      this.user_repo.findOne({ where: { firebaseId }, select: ['discountPercent', 'discountLabel'] }),
    ]);

    const activeStatuses = [PayStatus.TRIAL, PayStatus.PAID];
    const activeSubs = subs.filter(s => activeStatuses.includes(s.payStatus));

    const hasInvoices = activeSubs.some(s => s.moduleName === ModuleName.INVOICES);
    const hasOB = activeSubs.some(s => s.moduleName === ModuleName.OPEN_BANKING);

    let monthlyTotalNis: number;
    const hasCombinedDiscount = hasInvoices && hasOB;

    if (hasCombinedDiscount) {
      monthlyTotalNis = 54;
    } else if (hasInvoices) {
      monthlyTotalNis = 15;
    } else if (hasOB) {
      monthlyTotalNis = 45;
    } else {
      monthlyTotalNis = 0;
    }

    const discountPercent = Number(user?.discountPercent ?? 0);
    const discountLabel = user?.discountLabel ?? null;
    const finalAmountNis = monthlyTotalNis > 0
      ? Math.round(monthlyTotalNis * (1 - discountPercent / 100) * 100) / 100
      : 0;

    return {
      modules: subs.map(s => ({
        moduleName: s.moduleName,
        payStatus: s.payStatus,
        trialEndDate: s.trialEndDate,
        monthlyPriceNis: Number(s.monthlyPriceNis),
      })),
      monthlyTotalNis,
      hasCombinedDiscount,
      discountPercent,
      discountLabel,
      finalAmountNis,
    };
  }

  getCities(): CityDto[] {
    return cities;
  }

  /** Baseline for the general document counter (see documents.service settingGeneralIndex). */
  private static readonly GENERAL_COUNTER_BASE = 1_000_000;

  /**
   * Get all users (admin only).
   * Adds `generalDocumentsCount`: מספר מסמכים = currentIndex − 1_000_000 (המונה מתחיל ב־1000000).
   * שורה אחת לכל (userId, עוסק); אם יש כמה שורות GENERAL למשתמש — לוקחים MAX(currentIndex).
   */
  async getAllUsers(): Promise<(User & { generalDocumentsCount: number })[]> {
    try {
      const users = await this.user_repo.find({
        order: {
          createdAt: 'DESC', // Most recent first
        },
      });

      const base = UsersService.GENERAL_COUNTER_BASE;
      const aggregates = await this.settingDocumentsRepo
        .createQueryBuilder('s')
        .select('s.userId', 'userId')
        .addSelect(`GREATEST(0, MAX(s.currentIndex) - :base)`, 'cnt')
        .where('s.docType = :dt', { dt: DocumentType.GENERAL })
        .setParameter('base', base)
        .groupBy('s.userId')
        .getRawMany<{ userId: string; cnt: string | null }>();

      const countByFirebaseId = new Map<string, number>();
      for (const row of aggregates) {
        const n = row.cnt != null ? Number(row.cnt) : 0;
        countByFirebaseId.set(row.userId, Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0);
      }

      return users.map((u) => ({
        ...u,
        generalDocumentsCount: countByFirebaseId.get(u.firebaseId) ?? 0,
      }));
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch users');
    }
  }

}