import { Body, Controller, Post, Get, Patch, Delete, Headers,
         Param, Query, ParseIntPipe, NotFoundException, Session, UseGuards, Req, HttpException, HttpStatus, Logger,
         Inject, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AuthenticatedRequest } from 'src/interfaces/authenticated-request.interface';
import { FeezbackService } from '../feezback/feezback.service';

@Controller('auth')
export class UsersController {
    private readonly logger = new Logger(UsersController.name);

    constructor(
        private userService: UsersService,
        private authService: AuthService,
        @Inject(forwardRef(() => FeezbackService)) private readonly feezbackService: FeezbackService,
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
        this.logger.log(`signin called, userId=${maskedId}`);
        const user = await this.userService.signin(userId);

        // Fire-and-forget — do not block the login response.
        // Pull 1 (short window) runs first; Pull 2 (12-month backfill) starts
        // only after Pull 1 fully resolves.
        void this.triggerPostLoginSync(userId).catch(err =>
            this.logger.error('[PostLoginSync] unhandled top-level error', err?.stack ?? err),
        );

        return user;
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

    /**
     * Delegates to the shared FeezbackService.triggerFullSync orchestration.
     * All pull logic, date-range computation, logging, and dedup now live there.
     */
    // private async triggerPostLoginSync(firebaseId: string): Promise<void> {
    //     // Log #16
    //     this.logger.log(`[PostLoginSync] Triggered fire-and-forget | firebaseId=${firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?')}`);
    //     // Log #14 (failure) is in the .catch below
    //     void this.feezbackService.triggerFullSync(firebaseId, 'login')
    //         .catch(err => this.logger.error('[PostLoginSync] triggerFullSync failed', err?.stack ?? err));
    // }
    private async triggerPostLoginSync(firebaseId: string): Promise<void> {
        this.logger.log(
          `[PostLoginSync] Starting sync (await) | firebaseId=${
            firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?')
          }`,
        );
      
        try {
          await this.feezbackService.triggerFullSync(firebaseId, 'login');
      
          this.logger.log(
            `[PostLoginSync] Sync completed | firebaseId=${
              firebaseId?.length >= 8 ? firebaseId.substring(0, 8) + '...' : (firebaseId ?? '?')
            }`,
          );
        } catch (err) {
          this.logger.error(
            `[PostLoginSync] triggerFullSync failed`,
            err?.stack ?? err,
          );
        }
      }
}
