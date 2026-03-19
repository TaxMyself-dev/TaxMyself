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
     * Background Feezback sync triggered after every successful login.
     *
     * Pull 1: current month + 2 previous full months  → ~90 days, fast.
     * Pull 2: 12 months backward → full backfill.
     *
     * Bank and card are pulled in parallel within each pull.
     * Pull 2 starts only after Pull 2 is fully resolved to avoid the
     * in-flight deduplication guard on getAndSaveUserCardTransactions
     * reusing Pull 1's promise with the wrong date range.
     */
    private async triggerPostLoginSync(firebaseId: string): Promise<void> {
        const sub = `${firebaseId}_sub`;
        const today = new Date();
        const fmt = (d: Date): string => d.toISOString().split('T')[0];

        // Pull 1: first day of the month 2 months ago → today
        const pull1From = fmt(new Date(today.getFullYear(), today.getMonth() - 2, 1));
        const pull1To   = fmt(today);

        this.logger.log(`[PostLoginSync] Pull 1 start: ${pull1From} → ${pull1To}`);

        await Promise.all([
            this.feezbackService
                .getAndSaveBankTransactions(firebaseId, sub, 'booked', pull1From, pull1To)
                .catch(e => this.logger.error('[PostLoginSync] Pull 1 bank error', e?.stack ?? e)),
            this.feezbackService
                .getAndSaveUserCardTransactions(firebaseId, sub, 'booked', pull1From, pull1To)
                .catch(e => this.logger.error('[PostLoginSync] Pull 1 card error', e?.stack ?? e)),
        ]);

        this.logger.log('[PostLoginSync] Pull 1 done');

        // Pull 2: 12 months back → same dateTo as Pull 1
        const pull2From = fmt(new Date(today.getFullYear() - 1, today.getMonth(), today.getDate()));

        this.logger.log(`[PostLoginSync] Pull 2 start: ${pull2From} → ${pull1To}`);

        await Promise.all([
            this.feezbackService
                .getAndSaveBankTransactions(firebaseId, sub, 'booked', pull2From, pull1To)
                .catch(e => this.logger.error('[PostLoginSync] Pull 2 bank error', e?.stack ?? e)),
            this.feezbackService
                .getAndSaveUserCardTransactions(firebaseId, sub, 'booked', pull2From, pull1To)
                .catch(e => this.logger.error('[PostLoginSync] Pull 2 card error', e?.stack ?? e)),
        ]);

        this.logger.log('[PostLoginSync] Pull 2 done');
    }

}
