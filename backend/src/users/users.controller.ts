import { Body, Controller, Post, Get, Patch, Delete, Headers,
         Param, ParseIntPipe, NotFoundException, Session, UseGuards, Req, HttpException, HttpStatus, Logger,
         Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FeezbackService } from '../feezback/feezback.service';
import { GoogleDriveService } from '../google-drive/google-drive.service';
import { User } from './user.entity';

@Controller('auth')
export class UsersController {
    private readonly logger = new Logger(UsersController.name);

    constructor(
        private userService: UsersService,
        private authService: AuthService,
        @Inject(forwardRef(() => FeezbackService)) private readonly feezbackService: FeezbackService,
        private readonly googleDriveService: GoogleDriveService,
        @InjectRepository(User) private readonly userRepo: Repository<User>,
    ) {}


    @Post('/signup')
    async createUser(@Body() body: any) {
        const user = await this.userService.signup(body);
        return body; //TODO: Elazar - check if it's necessary to return the body
    }


    @Get('/signin')
    @UseGuards(FirebaseAuthGuard)
    async signin(@Req() request: AuthenticatedRequest) {
        const userId = request.user?.firebaseId;
        const maskedId = userId?.length >= 8 ? userId.substring(0, 8) + '...' : userId ?? '?';
        // `/auth/signin` is also hit by the auth-guard session-restore, the
        // settings page, and view-as-client — none of which are a real login.
        // Only the actual login screen passes ?freshLogin=true, so the
        // post-login sync (and its LOGIN banner) fires exactly once per login,
        // not on every page navigation.
        const isFreshLogin = String(request.query?.freshLogin) === 'true';
        this.logger.log(`signin called, userId=${maskedId}, freshLogin=${isFreshLogin}`);
        const user = await this.userService.signin(userId, isFreshLogin);

        if (isFreshLogin) {
            // Fire-and-forget — do not block the login response.
            void this.triggerPostLoginSync(userId, user).catch(err =>
                this.logger.error(`[Login] post-login sync failed`, err?.stack ?? err),
            );
        }

        return user;
    }


    @Get('/billing-status')
    @UseGuards(FirebaseAuthGuard)
    async getBillingStatus(@Req() request: AuthenticatedRequest) {
        const userId = request.user?.firebaseId;
        if (!userId) throw new NotFoundException('user not exist');
        return this.userService.getBillingStatus(userId);
    }


    @Get('/get-user')
    @UseGuards(FirebaseAuthGuard)
    async getUser(@Req() request: AuthenticatedRequest) {
        const userId = request.user?.firebaseId;
        if (!userId) throw new NotFoundException("user not exist");
        const user = await this.userService.findFireUser(userId);
        if (user) return user;
        throw new NotFoundException("user not exist");
    }


    @Patch('update-user')
    @UseGuards(FirebaseAuthGuard)
    async updateUser(@Req() request: AuthenticatedRequest, @Body() body: any) {
        if (request.user?.role === 'agent') {
            throw new HttpException('לרואה חשבון הרשאה לצפייה בלבד', HttpStatus.FORBIDDEN);
        }
        const userId = request.user?.firebaseId;
        return this.userService.updateUser(userId, body);
    }

    @Get('children')
    @UseGuards(FirebaseAuthGuard)
    async getChildren(@Req() request: AuthenticatedRequest) {
        const firebaseId = request.user?.firebaseId;
        return this.userService.getChildren(firebaseId);
    }

    @Patch('children')
    @UseGuards(FirebaseAuthGuard)
    async updateChildren(@Req() request: AuthenticatedRequest, @Body() body: { children: Array<{ childFName: string; childLName: string; childDate: string }> }) {
        const firebaseId = request.user?.firebaseId;
        const list = Array.isArray(body?.children) ? body.children : [];
        return this.userService.updateChildren(firebaseId, list);
    }

    @Delete('children/:index')
    @UseGuards(FirebaseAuthGuard)
    async deleteChild(@Req() request: AuthenticatedRequest, @Param('index', ParseIntPipe) index: number) {
        const firebaseId = request.user?.firebaseId;
        await this.userService.deleteChild(firebaseId, index);
    }

    @Get('get-cities')
    async getCities() {
      return this.userService.getCities();
    }

    @Get('all-users')
    @UseGuards(FirebaseAuthGuard)
    async getAllUsers(@Req() request: AuthenticatedRequest) {
      const firebaseId = request.user?.firebaseId;
      
      // Check if user is admin
      const isAdmin = await this.userService.isAdmin(firebaseId);
      if (!isAdmin) {
        throw new HttpException('Admin access required', HttpStatus.FORBIDDEN);
      }

      return this.userService.getAllUsers();
    }

    // TODO: remove before production — manual trigger for Drive folder
    // provisioning on existing users. Unauthenticated so it's curl/REST-Client
    // friendly during development. Provisions user root + folders for each of
    // the user's businesses (full structure), idempotent for already-existing
    // folders, and recovers from manually-deleted ones.
    @Post('dev/drive/create-folder/:userId')
    async devCreateDriveFolder(@Param('userId', ParseIntPipe) userId: number) {
        const user = await this.userRepo.findOne({ where: { index: userId } });
        if (!user) throw new NotFoundException(`User #${userId} not found`);

        // If the stored user folder id is dead in Drive, null it so
        // provisionDriveStructure re-creates one.
        let staleId: string | null = null;
        if (user.driveFolderId) {
            const stillThere = await this.googleDriveService.folderExists(user.driveFolderId);
            if (!stillThere) {
                staleId = user.driveFolderId;
                user.driveFolderId = null;
                await this.userRepo.save(user);
            }
        }

        await this.userService.provisionDriveStructure(user);

        const refreshed = await this.userRepo.findOne({ where: { index: userId } });
        return {
            userFolderId: refreshed?.driveFolderId ?? null,
            userFolderUrl: refreshed?.driveFolderId
                ? this.googleDriveService.getFolderUrl(refreshed.driveFolderId)
                : null,
            recoveredFromStaleId: staleId,
        };
    }

    /**
     * One-off backfill: walk every user and re-run provisionDriveStructure.
     * For businesses whose Drive parent folder exists but the
     * inbox/processed/archive sub-folder ids are NULL (typical for businesses
     * created before the 2026-06-08 refactor), the service-layer logic
     * creates the three sub-folders and persists their ids.
     *
     * Idempotent. Intended to be called once after deploy. Unauthenticated
     * for curl convenience during dev — keep this gated behind something
     * stricter before exposing publicly.
     */
    @Post('dev/drive/backfill-inbox-folders')
    async devBackfillInboxFolders() {
        const users = await this.userRepo.find();
        const out = {
            usersProcessed: 0,
            usersFailed: 0,
            failures: [] as Array<{ userIndex: number; error: string }>,
        };
        for (const user of users) {
            try {
                await this.userService.provisionDriveStructure(user);
                out.usersProcessed++;
            } catch (err: any) {
                out.usersFailed++;
                out.failures.push({
                    userIndex: user.index,
                    error: err?.message ?? String(err),
                });
                this.logger.error(
                    `[Drive backfill] user.index=${user.index} failed: ${err?.message ?? err}`,
                    err?.stack,
                );
            }
        }
        return out;
    }

    private async triggerPostLoginSync(firebaseId: string, user?: any): Promise<void> {
        const userName = [user?.fName, user?.lName].filter(Boolean).join(' ') || firebaseId?.substring(0, 8) + '...';
        const hasOpenBanking = !!user?.hasOpenBanking;

        // Snapshot of Drive provisioning state at login time. The lazy
        // backfill in UsersService.signin runs in the background — the next
        // login will reflect the new state here.
        const drive = await this.userService.getDriveProvisioningStatus(firebaseId);

        console.log(`\n════════════════════════════════════`);
        console.log(`  LOGIN`);
        console.log(`  User         : ${userName}`);
        console.log(`  Open Banking : ${hasOpenBanking ? '✓ connected' : '✗ not connected'}`);
        console.log(`  Drive folders:  (DB = id stored in our DB, Drive = folder actually present in Google Drive)`);

        // User root — both DB and Drive state, so the user can see whether
        // the next provision pass will LINK to an existing Drive folder or
        // CREATE a new one. Most common confusion: DB column got wiped but
        // the Drive folder is still there.
        const ur = drive.userRoot;
        const ddDrive = ur.driveExists === null ? '? drive-check failed' : (ur.driveExists ? '✓ in Drive' : '✗ not in Drive');
        const ddDb    = ur.hasDbId ? '✓ in DB' : '✗ no DB id';
        const userAction = (() => {
            if (ur.hasDbId && ur.driveExists === true)  return '— complete';
            if (ur.hasDbId && ur.driveExists === false) return '— stored ID is dead → will null + re-create';
            if (!ur.hasDbId && ur.driveExists === true) return '— will link to existing Drive folder';
            if (!ur.hasDbId && ur.driveExists === false) return '— will create new in Drive';
            return '— Drive check unavailable → will find-or-create';
        })();
        console.log(`    User root "${ur.expectedName}"`);
        console.log(`      ${ddDb}, ${ddDrive}  ${userAction}`);

        if (drive.businesses.length === 0) {
            console.log(`    (no businesses yet)`);
        } else {
            for (const b of drive.businesses) {
                const label = `"${b.businessName ?? '(no name)'}" (#${b.businessNumber ?? '?'})`;
                const dbState = [
                    `parent ${b.hasParent ? '✓' : '✗'}`,
                    `inbox ${b.hasInbox ? '✓' : '✗'}`,
                    `processed ${b.hasProcessed ? '✓' : '✗'}`,
                ].join(', ');
                const driveLine = (() => {
                    switch (b.parentDriveState) {
                        case 'ok':       return 'parent ✓ in Drive, correctly under user root';
                        case 'orphaned': return 'parent EXISTS in Drive but NOT under user root (orphaned)';
                        case 'dead':     return b.hasParent ? 'parent ID is 404/trashed in Drive' : 'no folder of expected name in Drive';
                        case 'unknown':  return 'drive-check failed';
                    }
                })();

                // Decide what's actually going to happen on the next pass.
                // The key call-outs: "complete in DB" but parent is orphaned
                // or dead means the user can't see the folders even though
                // we think they're fine. Surface that explicitly so it's not
                // a mystery.
                let action: string;
                if (b.hasParent && b.parentDriveState === 'orphaned') {
                    action = '⚠ DB has IDs but the folder is orphaned (under a deleted/wrong user root) → next pass will wipe all IDs and re-create under the current user root';
                } else if (b.hasParent && b.parentDriveState === 'dead') {
                    action = '⚠ DB has IDs but parent folder is GONE in Drive → next pass will wipe all IDs and re-create';
                } else if (!b.hasParent && b.parentDriveState === 'ok') {
                    action = '— parent exists in Drive (no DB id) → will link to existing + create sub-folders';
                } else if (!b.hasParent) {
                    action = '— will create parent + inbox/processed';
                } else if (b.complete) {
                    action = '— complete';
                } else {
                    const missing = [
                        !b.hasInbox && 'inbox',
                        !b.hasProcessed && 'processed',
                    ].filter(Boolean) as string[];
                    action = `— will find-or-create sub-folders: ${missing.join(', ')}`;
                }

                console.log(`    ${label}`);
                console.log(`      DB: ${dbState}`);
                console.log(`      Drive: ${driveLine}`);
                console.log(`      ${action}`);
            }
        }
        console.log(`════════════════════════════════════\n`);

        if (!hasOpenBanking) return;

        // NOTE: deliberately NOT gated on hasUnprocessedConsentFlow anymore.
        // The webhook only runs discovery (refreshUserSources) — it never
        // triggers a sync — so a login sync over the user's EXISTING sources
        // can't race anything. A user who stepped out mid-consent should still
        // get their existing accounts synced on the next real login.
        void this.feezbackService.triggerFullSync(firebaseId, 'login')
            .catch(err => {
                this.logger.error(`[Login] triggerFullSync failed | user=${userName} | error=${err?.message}`, err?.stack ?? err);
            });
    }
}
