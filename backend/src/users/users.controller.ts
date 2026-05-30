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

    private async triggerPostLoginSync(firebaseId: string, user?: any): Promise<void> {
        const userName = [user?.fName, user?.lName].filter(Boolean).join(' ') || firebaseId?.substring(0, 8) + '...';
        const hasOpenBanking = !!user?.hasOpenBanking;

        // Snapshot of Drive provisioning state at login time. The lazy
        // backfill in UsersService.signin runs in the background — the next
        // login will reflect the new state here.
        const drive = await this.userService.getDriveProvisioningStatus(firebaseId);
        let driveLine: string;
        if (!drive.hasUserFolder && drive.businessesTotal === 0) {
            driveLine = '✗ no folders';
        } else if (drive.hasUserFolder && drive.businessesWithFolder === drive.businessesTotal) {
            driveLine = `✓ provisioned (user + ${drive.businessesWithFolder}/${drive.businessesTotal} businesses)`;
        } else if (drive.hasUserFolder) {
            driveLine = `⚠ partial (user OK, ${drive.businessesWithFolder}/${drive.businessesTotal} businesses) — backfilling`;
        } else {
            driveLine = `✗ none (0/${drive.businessesTotal} businesses) — backfilling in background`;
        }

        console.log(`\n════════════════════════════════════`);
        console.log(`  LOGIN`);
        console.log(`  User         : ${userName}`);
        console.log(`  Open Banking : ${hasOpenBanking ? '✓ connected' : '✗ not connected'}`);
        console.log(`  Drive folders: ${driveLine}`);
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
