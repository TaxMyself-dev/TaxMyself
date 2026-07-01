import { BadRequestException, forwardRef, HttpException, HttpStatus, Inject, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { Any, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Child } from './child.entity';
import { UserRole, BusinessType, VATReportingType, TaxReportingType, FamilyStatus, EmploymentType, BusinessStatus, DocumentType, isBusinessTypeAllowedForUser } from '../enum';
import { AuthService } from './auth.service';
import * as admin from 'firebase-admin';
import { UpdateUserDto } from './dtos/update-user.dto';
import { SharedService } from 'src/shared/shared.service';
import { CityDto } from '../cities/city.dto';
import { cities } from '../cities/cities.data';
import { Business } from 'src/business/business.entity';
import { SettingDocuments } from 'src/documents/settingDocuments.entity';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { Delegation, DelegationStatus } from '../delegation/delegation.entity';
import { isDemoEmail } from '../demo-data/profiles';
import { BillingService } from '../billing/services/billing.service';


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
      @InjectRepository(Delegation)
      private readonly delegationRepo: Repository<Delegation>,
      private readonly googleDriveService: GoogleDriveService,
      @Inject(forwardRef(() => BillingService))
      private readonly billingService: BillingService,
    ) {
    this.firebaseAuth = admin.auth();
  }

  /**
   * Returns the email addresses of every active accountant delegated to this
   * client. Used as `additionalShareEmails` when provisioning Drive folders,
   * so each accountant gets the client's folder in their own "Shared with me".
   */
  async getActiveAccountantEmailsForUser(clientFirebaseId: string): Promise<string[]> {
    const delegations = await this.delegationRepo.find({
      where: { userId: clientFirebaseId, status: DelegationStatus.ACTIVE },
      select: ['agentId'],
    });
    if (delegations.length === 0) return [];
    const agentIds = Array.from(new Set(delegations.map(d => d.agentId).filter(Boolean)));
    if (agentIds.length === 0) return [];
    const accountants = await this.user_repo.find({
      where: agentIds.map(id => ({ firebaseId: id })),
      select: ['email'],
    });
    return accountants.map(a => a.email).filter((e): e is string => !!e);
  }


  /**
   * Provisions a Subscription row (TRIAL, all modules) for a newly created
   * User — the single trial-creation path shared by signup, delegated-client
   * creation, and demo-data seeding. Delegates entirely to BillingService so
   * there is exactly one trial definition in the codebase.
   */
  async ensureTrialSubscription(firebaseId: string): Promise<void> {
    await this.billingService.ensureTrialSubscription(firebaseId);
  }

  async signup({ personal, spouse, children, business }: any) {

    // -------------------------------------------------------
    // 1️⃣ SAFE NORMALIZATION
    // -------------------------------------------------------

    const isCompany = !!personal?.isCompany;

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

    // Reject a businessType that doesn't match the registration kind
    // (e.g. a company picking EXEMPT, or a private user picking LIMITED_COMPANY).
    for (const biz of newBusinesses) {
      if (!isBusinessTypeAllowedForUser(isCompany, biz?.businessType as BusinessType | null | undefined)) {
        throw new BadRequestException(`סוג עסק לא תואם לסוג ההרשמה: ${biz?.businessType}`);
      }
    }

    // -------------------------------------------------------
    // 2️⃣ Create the user object
    // -------------------------------------------------------
    const newUser = {
      ...personal,
      // Empty string is not a valid MySQL ENUM/DATE value — coerce to null so
      // TypeORM writes NULL rather than '' when the user left the field blank.
      gender: personal?.gender || null,
      dateOfBirth: personal?.dateOfBirth || null,
      ...safeSpouse,
      role: [UserRole.REGULAR],
      finsiteId: 0,
      createdAt: new Date(),
    };

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
    // 4️⃣b Create the Subscription row — single source of truth for trial state.
    // -------------------------------------------------------
    await this.ensureTrialSubscription(savedUser.firebaseId);

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
      if (!biz.businessName && !biz.businessNumber && !biz.businessType) continue;

      const newBusiness = this.business_repo.create({
        ...biz,
        firebaseId: personal.firebaseId,
      });

      // Company registration: the business IS the company, so phone/email/
      // name come straight from the company's own personal fields — no
      // id-matching needed (a company has no personal id).
      if (isCompany) {
        if (!newBusiness.businessPhone && personal?.phone) {
          newBusiness.businessPhone = personal.phone;
        }
        if (!newBusiness.businessEmail && personal?.email) {
          newBusiness.businessEmail = personal.email;
        }
        if (!newBusiness.businessName && personal?.fName) {
          newBusiness.businessName = personal.fName;
        }
      }

      // Fill null business fields from personal or spouse data
      // Check if businessNumber matches personal.id or spouse.id
      const businessNumber = newBusiness.businessNumber;
      const personalId = personal?.id;
      const spouseId = safeSpouse?.spouseId || safeSpouse?.id;

      if (!isCompany && businessNumber && (businessNumber === personalId || businessNumber === spouseId)) {
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
        case BusinessType.EXEMPT_PARTNERSHIP:
          newBusiness.vatReportingType = VATReportingType.NOT_REQUIRED;
          newBusiness.taxReportingType = TaxReportingType.DUAL_MONTH_REPORT;
          break;

        case BusinessType.LICENSED:
        case BusinessType.LIMITED_COMPANY:
        case BusinessType.AUTHORIZED_PARTNERSHIP:
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

    // -------------------------------------------------------
    // 9️⃣  Provision Google Drive structure: user root + a folder per business
    //     with the inbox/processed sub-folders. Fire-and-forget so
    //     signup returns immediately — the scaffold takes a few Drive API
    //     calls per business, and Drive outages shouldn't block the response.
    //     If anything drops on the floor, DocumentsService.processInboxForUser
    //     calls provisionDriveStructure again on first report-page visit and
    //     fills the gap.
    // -------------------------------------------------------
    void this.provisionDriveStructure(savedUser).catch(err =>
      this.logger.error(
        `[signup] background Drive provisioning failed for firebaseId=${savedUser.firebaseId}: ${err?.message ?? err}`,
        err?.stack,
      ),
    );

    return savedUser;
  }


  async signin(firebaseId: string, freshLogin = false) {
    // Shift lastLoginAt → previousLoginAt and stamp the new lastLoginAt so the
    // frontend can show "last login was on ...". Only on a REAL login —
    // /auth/signin is also hit by session-restore / view-as / navigation, and
    // shifting on those would churn the timestamps every page change.
    if (freshLogin) {
      const raw = await this.user_repo.findOne({ where: { firebaseId } });
      if (raw) {
        raw.previousLoginAt = raw.lastLoginAt;
        raw.lastLoginAt = new Date();
        await this.user_repo.save(raw);

        // Backfill Drive folders for the logged-in user, AND if they're an
        // accountant with active delegations, also backfill folders + shares
        // for every one of their clients. Fire-and-forget; everything below
        // is idempotent end-to-end.
        void (async () => {
          // 1) The user's own folders (no-op if already provisioned)
          const accountantEmails = await this.getActiveAccountantEmailsForUser(firebaseId);
          await this.provisionDriveStructure(raw, accountantEmails);

          // 2) If this user IS an accountant, walk their clients and provision
          //    each one — sharing with this accountant's email. Handles existing
          //    accountants whose clients haven't logged in since the feature shipped.
          await this.backfillDelegatedClients(raw);
        })().catch(err =>
          this.logger.error(
            `[signin] background Drive provisioning failed for firebaseId=${firebaseId}: ${err?.message ?? err}`,
            err?.stack,
          ),
        );
      }
    }
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

      // Enrich with businessNumber(s) from Business table so the frontend
      // always has the correct value in userData (localStorage).
      const businesses = await this.business_repo.find({ where: { firebaseId } });
      const [primary, spouse] = businesses.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
      return {
        ...user,
        businessNumber: primary?.businessNumber ?? null,
        spouseBusinessNumber: spouse?.businessNumber ?? null,
        // Gates the dashboard's "אפס נתוני בדיקה" button. True when the
        // signed-in user's email matches a DEMO_PROFILES entry — see
        // demo-data/profiles/index.ts. Persisted into IUserData on the
        // frontend (localStorage) on every sign-in so the button shows up
        // immediately after a demo seed without a full reload.
        isDemo: isDemoEmail(user.email),
      };
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

  /**
   * Provision the full Drive folder structure for a user:
   *   user-root/
   *     business-A/
   *       inbox/  processed/
   *     business-B/
   *       inbox/  processed/
   *
   * Best-effort everywhere — Drive failure leaves null IDs that the lazy
   * auto-provision in DocumentsService.processInboxForUser fills in later.
   *
   * Called after businesses are saved in signup() so we already know their
   * names. Idempotent: skips anything that already has all four folder ids.
   */
  async provisionDriveStructure(
    user: User,
    additionalShareEmails: string[] = [],
  ): Promise<void> {
    if (!user.firebaseId) return;

    // Dedupe + drop falsy entries and the user's own email (already shared).
    const extraEmails = Array.from(new Set(
      additionalShareEmails.filter(e => !!e && e !== user.email),
    ));

    const userTag = `index=${user.index}, fid=${user.firebaseId?.substring(0, 8)}...`;
    this.logger.log(
      `[Drive] provisionDriveStructure START | ${userTag} | userFolderId=${user.driveFolderId ?? '∅'}`,
    );

    // Verify the stored user folder is BOTH (a) still alive in Drive AND
    // (b) parented under the currently-configured root folder. The second
    // check catches the case where the root moved (typical: My Drive →
    // Shared Drive migration): the old user folder still exists in the
    // old location, `folderExists` happily returns true, and without the
    // parent check we'd keep creating business sub-folders under the
    // stale parent forever.
    //
    // Deferred-wipe: only flag the row as stale here. The DB still holds the
    // old ID until we successfully create the replacement below — that way a
    // create failure leaves the row pointing at the (stale-but-real) old
    // folder instead of nulling it out. The business loop further down also
    // uses this pattern: it mutates `business` in memory and only saves after
    // the new folder ID is in hand.
    let userFolderIsStale = false;
    if (user.driveFolderId) {
      try {
        const parents = await this.googleDriveService.getFolderParents(user.driveFolderId);
        const currentRoot = this.googleDriveService.getRootFolderId();
        if (parents === null) {
          this.logger.warn(
            `[Drive] stored user folder ${user.driveFolderId} is 404/trashed — will re-create | ${userTag}`,
          );
          userFolderIsStale = true;
        } else if (!parents.includes(currentRoot)) {
          this.logger.warn(
            `[Drive] stored user folder ${user.driveFolderId} is parented under ` +
            `[${parents.join(',')}] but current root is ${currentRoot} — will re-create under the new root | ${userTag}`,
          );
          userFolderIsStale = true;
        }
      } catch (err: any) {
        this.logger.error(
          `[Drive] parent-check failed for user folder ${user.driveFolderId} | ${userTag}: ${err?.message ?? err}`,
        );
      }
    }

    let createdUserFolder = false;
    let createdBusinessFolders = 0;
    let skippedBusinessFolders = 0;
    let failedBusinessFolders = 0;

    // 1) User root folder. createUserFolder is find-or-create by (name, parent)
    // so a stale row whose folder still exists under the NEW root just resolves
    // back to the same ID — no duplicate folders.
    if (!user.driveFolderId || userFolderIsStale) {
      const previousId = user.driveFolderId;
      try {
        const folderId = await this.googleDriveService.createUserFolder(
          this.buildDriveFolderName(user),
          user.email,
        );
        user.driveFolderId = folderId;
        await this.user_repo.save(user);
        createdUserFolder = true;
        this.logger.log(
          `[Drive] ✓ ${previousId ? `replaced stale user folder ${previousId} with` : 'created user folder'} ${folderId} for ${userTag}`,
        );
      } catch (error) {
        this.logger.error(
          `[Drive] ✗ user folder FAILED for ${userTag}: ${(error as Error)?.message ?? error}`,
          (error as Error)?.stack,
        );
        return; // can't create business folders without a parent
      }
    }

    // Share the user root with any additional emails (typically the
    // delegated accountants). shareFolder is idempotent — repeated calls
    // are 409-swallowed — so this is safe on every backfill.
    if (extraEmails.length > 0) {
      await this.shareFolderWithMany(user.driveFolderId, extraEmails, `user folder | ${userTag}`);
    }

    // 2) Per-business sub-folders
    const businesses = await this.business_repo.find({
      where: { firebaseId: user.firebaseId },
    });
    for (const business of businesses) {
      // Stale-id check for the business parent. Two failure modes both
      // require wiping all 4 IDs so the create branch runs cleanly:
      //   (1) the folder ID is dead in Drive (404 / trashed)
      //   (2) the folder ID resolves to a real folder but it's NOT a child
      //       of the current user root — typically because the previous user
      //       root was deleted and getOrCreateChildFolder created a fresh
      //       one, orphaning all the businesses under the old (now-dead)
      //       parent. `folderExists` returns true in this case, so the
      //       previous version of this check silently kept the dead IDs.
      // Also wipe on uncertainty (folderExists throws) — better to re-create
      // than leave the user pointing at unreachable folders. Drive's
      // find-or-create dedupe means we won't accidentally double up.
      if (business.driveFolderId) {
        let parentLikelyDead = false;
        let reason = '';
        try {
          const parents = await this.googleDriveService.getFolderParents(business.driveFolderId);
          if (parents === null) {
            parentLikelyDead = true;
            reason = 'folder is 404/trashed in Drive';
          } else if (user.driveFolderId && !parents.includes(user.driveFolderId)) {
            parentLikelyDead = true;
            reason = `folder exists but isn't parented under user root ${user.driveFolderId} (actual parents=[${parents.join(',')}])`;
          }
        } catch (err: any) {
          parentLikelyDead = true;
          reason = `getFolderParents threw: ${err?.message ?? err}`;
        }
        if (parentLikelyDead) {
          this.logger.warn(
            `[Drive] business folder ${business.driveFolderId} (biz=${business.businessNumber}) ${reason} — wiping all folder IDs and re-creating | ${userTag}`,
          );
          business.driveFolderId          = null;
          business.driveInboxFolderId     = null;
          business.driveProcessedFolderId = null;
        }
      }
      // Three states per business:
      //   (a) no parent folder yet         → create parent + inbox + processed
      //   (b) parent exists, sub-folders missing  → backfill sub-folders
      //   (c) parent + inbox + processed  → skip (still re-share)
      const subFoldersMissing =
        !business.driveInboxFolderId
        || !business.driveProcessedFolderId;

      if (business.driveFolderId && !subFoldersMissing) {
        skippedBusinessFolders++;
        if (extraEmails.length > 0) {
          await this.shareFolderWithMany(
            business.driveFolderId,
            extraEmails,
            `business folder biz=${business.businessNumber} (existed) | ${userTag}`,
          );
        }
        continue;
      }

      try {
        const displayName =
          business.businessName?.trim() || `business-${business.businessNumber ?? business.id}`;

        if (!business.driveFolderId) {
          // (a) Brand-new business: create parent + inbox + processed in
          // one shot via ensureBusinessFolder.
          const folders = await this.googleDriveService.ensureBusinessFolder(
            user.driveFolderId,
            displayName,
          );
          business.driveFolderId          = folders.folderId;
          business.driveInboxFolderId     = folders.inboxFolderId;
          business.driveProcessedFolderId = folders.processedFolderId;
          createdBusinessFolders++;
          this.logger.log(
            `[Drive] ✓ created business folder ${folders.folderId} + inbox/processed ("${displayName}", biz=${business.businessNumber}) for ${userTag}`,
          );
        } else {
          // (b) Existing business folder, but the sub-folder ids on the row
          // are NULL — typical for businesses created before this refactor.
          // ensureInboxAndProcessed is find-or-create so this is safe
          // even if the folders were partially created in a previous run.
          const subFolders = await this.googleDriveService.ensureInboxAndProcessed(
            business.driveFolderId,
          );
          business.driveInboxFolderId     = subFolders.inboxFolderId;
          business.driveProcessedFolderId = subFolders.processedFolderId;
          createdBusinessFolders++;
          this.logger.log(
            `[Drive] ✓ backfilled inbox/processed under existing folder ${business.driveFolderId} ("${displayName}", biz=${business.businessNumber}) for ${userTag}`,
          );
        }

        await this.business_repo.save(business);
      } catch (error) {
        failedBusinessFolders++;
        this.logger.error(
          `[Drive] ✗ business folder FAILED for biz=${business.businessNumber} (${userTag}): ${(error as Error)?.message ?? error}`,
          (error as Error)?.stack,
        );
        continue; // can't share what we couldn't create
      }

      // Share the business folder with extra emails too (created OR existed).
      if (extraEmails.length > 0 && business.driveFolderId) {
        await this.shareFolderWithMany(
          business.driveFolderId,
          extraEmails,
          `business folder biz=${business.businessNumber} | ${userTag}`,
        );
      }
    }

    this.logger.log(
      `[Drive] provisionDriveStructure DONE | ${userTag} | ` +
      `userFolder=${createdUserFolder ? 'created' : 'existed'} | ` +
      `businesses: ${createdBusinessFolders} created, ${skippedBusinessFolders} skipped, ${failedBusinessFolders} failed`,
    );
  }

  /**
   * If the logged-in user is an accountant (has active Delegation rows where
   * agentId = themselves), provision Drive structure for each of their clients
   * AND share each folder with this accountant's email. Sequential to avoid
   * Drive API bursts. Per-client errors are logged and don't block the others.
   *
   * Effectively "one-time backfill on first accountant login after deploy" —
   * subsequent logins are a no-op since everything's idempotent.
   */
  private async backfillDelegatedClients(accountant: User): Promise<void> {
    if (!accountant.firebaseId || !accountant.email) return;

    const delegations = await this.delegationRepo.find({
      where: { agentId: accountant.firebaseId, status: DelegationStatus.ACTIVE },
      select: ['userId'],
    });
    if (delegations.length === 0) return;

    this.logger.log(
      `[Drive] accountant=${accountant.email} has ${delegations.length} delegated client(s) — backfilling`,
    );

    for (const d of delegations) {
      try {
        const client = await this.user_repo.findOne({ where: { firebaseId: d.userId } });
        if (!client) {
          this.logger.warn(`[Drive] delegated client ${d.userId} not found — skipping`);
          continue;
        }
        await this.provisionDriveStructure(client, [accountant.email]);
      } catch (err: any) {
        this.logger.error(
          `[Drive] backfill failed for client ${d.userId}: ${err?.message ?? err}`,
          err?.stack,
        );
      }
    }
  }

  /**
   * Best-effort share of a folder with multiple emails. Per-email failures are
   * logged and don't break the batch — Drive shares are idempotent (409 is
   * swallowed inside shareFolder) so this is safe to call repeatedly.
   */
  private async shareFolderWithMany(folderId: string, emails: string[], context: string): Promise<void> {
    for (const email of emails) {
      try {
        await this.googleDriveService.shareFolder(folderId, email, 'writer');
      } catch (err: any) {
        this.logger.warn(`[Drive] share with ${email} failed (${context}): ${err?.message ?? err}`);
      }
    }
  }

  buildDriveFolderName(user: User): string {
    const fullName = [user.fName, user.lName].filter(Boolean).join(' ').trim();
    return fullName || user.email || `user-${user.firebaseId}`;
  }

  /**
   * The set of emails (lower-cased) that are legitimately entitled to a given
   * Drive folder: every user the folder belongs to (its owner — or owners, if
   * a name-collision made two users share one folder), plus those users'
   * currently-active delegated accountants.
   *
   * This is the authority used both to decide what to revoke when a delegation
   * ends and to flag orphaned shares in the audit. Being owner-set-aware keeps
   * us from yanking an accountant who still has a live delegation to *another*
   * user that happens to share the same folder.
   */
  private async allowedEmailsForFolder(folderId: string): Promise<Set<string>> {
    const ownerFids = new Set<string>();
    const usersWithRoot = await this.user_repo.find({ where: { driveFolderId: folderId }, select: ['firebaseId'] });
    usersWithRoot.forEach(u => u.firebaseId && ownerFids.add(u.firebaseId));
    const bizWithFolder = await this.business_repo.find({ where: { driveFolderId: folderId }, select: ['firebaseId'] });
    bizWithFolder.forEach(b => b.firebaseId && ownerFids.add(b.firebaseId));

    const allowed = new Set<string>();
    for (const fid of ownerFids) {
      const owner = await this.user_repo.findOne({ where: { firebaseId: fid }, select: ['email'] });
      if (owner?.email) allowed.add(owner.email.toLowerCase());
      const accEmails = await this.getActiveAccountantEmailsForUser(fid);
      accEmails.forEach(e => allowed.add(e.toLowerCase()));
    }
    return allowed;
  }

  /**
   * Inverse of the accountant share: when a delegation ends, drop the
   * accountant's Drive access to the client's user-root and business folders.
   *
   * Collision-safe — skips any folder where the accountant is STILL entitled
   * (e.g. they hold a live delegation to another user sharing that folder).
   * Must be called AFTER the Delegation row has been removed/deactivated so
   * allowedEmailsForFolder reflects the post-removal state. Best-effort:
   * per-folder failures are logged, never thrown.
   */
  async revokeAccountantDriveAccess(clientFirebaseId: string, accountantEmail: string): Promise<void> {
    const email = accountantEmail.trim().toLowerCase();
    if (!email) return;

    const client = await this.user_repo.findOne({ where: { firebaseId: clientFirebaseId }, select: ['driveFolderId'] });
    const businesses = await this.business_repo.find({ where: { firebaseId: clientFirebaseId }, select: ['driveFolderId'] });

    const folderIds = new Set<string>();
    if (client?.driveFolderId) folderIds.add(client.driveFolderId);
    businesses.forEach(b => b.driveFolderId && folderIds.add(b.driveFolderId));

    for (const folderId of folderIds) {
      try {
        const allowed = await this.allowedEmailsForFolder(folderId);
        if (allowed.has(email)) {
          this.logger.log(
            `[Drive] keeping ${accountantEmail} on folder ${folderId} — still entitled via another active delegation/owner`,
          );
          continue;
        }
        const removed = await this.googleDriveService.revokeFolderAccess(folderId, accountantEmail);
        if (removed) {
          this.logger.log(`[Drive] revoked ${accountantEmail} from folder ${folderId} (delegation ended)`);
        }
      } catch (err: any) {
        this.logger.warn(`[Drive] revoke ${accountantEmail} from ${folderId} failed: ${err?.message ?? err}`);
      }
    }
  }

  /**
   * One-off audit/cleanup: scan every shared Drive folder (user-root + business
   * folders) and find `type: 'user'` grants that no longer map to the folder's
   * owner(s) or any active delegated accountant — i.e. shares orphaned by a
   * delegation that was removed before revoke-on-undelegate existed.
   *
   * Dry-run by default (`apply = false`): returns the list of orphaned grants
   * without touching Drive. Pass `apply = true` to actually revoke them.
   */
  async auditDriveShares(apply = false): Promise<{
    apply: boolean;
    foldersScanned: number;
    orphans: Array<{ folderId: string; email: string; role: string }>;
    revoked: number;
    errors: Array<{ folderId: string; email?: string; error: string }>;
  }> {
    const result = {
      apply,
      foldersScanned: 0,
      orphans: [] as Array<{ folderId: string; email: string; role: string }>,
      revoked: 0,
      errors: [] as Array<{ folderId: string; email?: string; error: string }>,
    };

    // Distinct set of folders we ever share (children inherit, so they aren't
    // shared directly and don't need scanning).
    const folderSet = new Set<string>();
    const users = await this.user_repo.find({ select: ['firebaseId', 'driveFolderId'] });
    users.forEach(u => u.driveFolderId && folderSet.add(u.driveFolderId));
    const businesses = await this.business_repo.find({ select: ['firebaseId', 'driveFolderId'] });
    businesses.forEach(b => b.driveFolderId && folderSet.add(b.driveFolderId));

    for (const folderId of folderSet) {
      result.foldersScanned++;
      let allowed: Set<string>;
      try {
        allowed = await this.allowedEmailsForFolder(folderId);
      } catch (err: any) {
        result.errors.push({ folderId, error: `allowed-emails lookup failed: ${err?.message ?? err}` });
        continue;
      }
      let perms: Array<{ id: string; emailAddress: string; role: string }>;
      try {
        perms = await this.googleDriveService.listFolderPermissions(folderId);
      } catch (err: any) {
        result.errors.push({ folderId, error: `list permissions failed: ${err?.message ?? err}` });
        continue;
      }
      for (const p of perms) {
        if (p.role === 'owner') continue; // never touch the service-account owner
        if (allowed.has(p.emailAddress.toLowerCase())) continue;
        result.orphans.push({ folderId, email: p.emailAddress, role: p.role });
        if (apply) {
          try {
            const removed = await this.googleDriveService.revokeFolderAccess(folderId, p.emailAddress);
            if (removed) result.revoked++;
          } catch (err: any) {
            result.errors.push({ folderId, email: p.emailAddress, error: err?.message ?? String(err) });
          }
        }
      }
    }
    return result;
  }

  /**
   * Snapshot of which Drive folders this user already has — used by the login
   * banner so the dev can see at a glance whether the lazy backfill is needed.
   */
  /**
   * Snapshot for the login banner. For each folder we want to track, return
   * BOTH the DB state (is the ID stored?) AND the Drive reality (does a
   * folder with that name/id actually exist in Drive?). The two can diverge
   * — most commonly when the demo-data wipe nullifies DB columns but leaves
   * Drive folders alone. The banner uses both to print accurate "will
   * link to existing" vs "will create new" actions.
   *
   * Drive checks are best-effort: a Drive outage falls back to "unknown"
   * (`driveExists: null`) rather than failing the whole login.
   */
  async getDriveProvisioningStatus(firebaseId: string): Promise<{
    userRoot: {
      expectedName: string;
      hasDbId: boolean;
      driveExists: boolean | null;   // null = couldn't check
    };
    businesses: Array<{
      businessNumber: string | null;
      businessName: string | null;
      hasParent: boolean;
      hasInbox: boolean;
      hasProcessed: boolean;
      complete: boolean;
      /** Drive-side reality check for the business parent folder.
       *    'ok'       — folder exists AND is a child of the current user root
       *    'orphaned' — folder exists in Drive but isn't under the user root
       *                 (typical after the previous user folder was deleted)
       *    'dead'     — folder ID resolves to 404/trashed in Drive, OR no
       *                 stored ID and no folder with the expected name found
       *    'unknown'  — Drive check failed (auth/transient) */
      parentDriveState: 'ok' | 'orphaned' | 'dead' | 'unknown';
    }>;
  }> {
    const user = await this.user_repo.findOne({ where: { firebaseId } });
    if (!user) {
      return {
        userRoot: { expectedName: '(no user)', hasDbId: false, driveExists: null },
        businesses: [],
      };
    }

    const expectedUserFolderName = this.buildDriveFolderName(user);
    let userDriveExists: boolean | null = null;

    if (user.driveFolderId) {
      // We have an ID — does Drive still know about it?
      try {
        userDriveExists = await this.googleDriveService.folderExists(user.driveFolderId);
      } catch {
        userDriveExists = null;
      }
    } else {
      // No DB ID — does a folder with the expected name already live under
      // the Drive root? Tells the user "will LINK to existing" rather than
      // the misleading "will create" when re-running after a demo wipe.
      try {
        const rootId = this.googleDriveService.getRootFolderId();
        const found = await this.googleDriveService.findChildFolder(rootId, expectedUserFolderName);
        userDriveExists = !!found;
      } catch {
        userDriveExists = null;
      }
    }

    const businesses = await this.business_repo.find({ where: { firebaseId } });

    // Probe Drive for each business's parent. We resolve to three states
    // (not two) — "ok / orphaned / dead" — so the banner can tell the user
    // why their folders aren't visible even though the DB has IDs. Most
    // common confusing case: ID resolves (folderExists=true) but the folder
    // is parented under a now-dead user root, so the user never sees it.
    const businessRows = await Promise.all(businesses.map(async b => {
      const hasParent    = !!b.driveFolderId;
      const hasInbox     = !!b.driveInboxFolderId;
      const hasProcessed = !!b.driveProcessedFolderId;

      let parentDriveState: 'ok' | 'orphaned' | 'dead' | 'unknown' = 'unknown';
      if (b.driveFolderId) {
        try {
          const parents = await this.googleDriveService.getFolderParents(b.driveFolderId);
          if (parents === null) {
            parentDriveState = 'dead';
          } else if (user.driveFolderId && !parents.includes(user.driveFolderId)) {
            parentDriveState = 'orphaned';
          } else {
            parentDriveState = 'ok';
          }
        } catch {
          parentDriveState = 'unknown';
        }
      } else if (b.businessName && user.driveFolderId) {
        // No stored parent — see if a folder with the expected name already
        // exists under the user root (find-or-create will link to it).
        try {
          const found = await this.googleDriveService.findChildFolder(user.driveFolderId, b.businessName);
          parentDriveState = found ? 'ok' : 'dead';
        } catch {
          parentDriveState = 'unknown';
        }
      }

      return {
        businessNumber: b.businessNumber,
        businessName: b.businessName,
        hasParent,
        hasInbox,
        hasProcessed,
        complete: hasParent && hasInbox && hasProcessed,
        parentDriveState,
      };
    }));

    return {
      userRoot: {
        expectedName: expectedUserFolderName,
        hasDbId: !!user.driveFolderId,
        driveExists: userDriveExists,
      },
      businesses: businessRows,
    };
  }

}