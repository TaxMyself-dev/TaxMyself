import { Body, Controller, Get, Logger, Post, Req, UseGuards } from '@nestjs/common';
import { FeezbackService } from './feezback.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';
import { log } from 'node:console';

@Controller('feezback')
export class FeezbackController {
  private readonly logger = new Logger(FeezbackController.name);

  constructor(private readonly feezbackService: FeezbackService) {}

  @Post('consent-link')
  @UseGuards(FirebaseAuthGuard)
  async createConsentLink(@Req() req: AuthenticatedRequest) {
    const firebaseId = req.user?.firebaseId;
    
    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    return this.feezbackService.createConsentLink(firebaseId);
  }

  // אופציונלי – רק כדי שתוכל לראות את ה-JWT עצמו
  // ולהעתיק לפוסטמן אם תרצה
  @Post('debug-token')
  @UseGuards(FirebaseAuthGuard)
  async debugToken(@Req() req: AuthenticatedRequest) {
    const firebaseId = req.user?.firebaseId;
    
    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    const token = await (this.feezbackService as any).feezbackJwtService.generateConsentJwt(
      firebaseId,
    );

    return { token };
  }

  /**
   * Webhook endpoint for Feezback events
   * Receives webhook when user data is available
   */
  @Post('webhook')
  async handleWebhook(@Body() webhookData: any) {
    this.logger.log(`Received webhook: ${JSON.stringify(webhookData)}`);

    // Handle UserDataIsAvailable event
    if (webhookData.event === 'UserDataIsAvailable') {
      const payload = webhookData.payload;
      const user = payload.user;
      const context = payload.context;

      // Extract firebaseId from context
      const firebaseId = this.feezbackService.extractFirebaseIdFromContext(context);
      
      this.logger.log(`Processing webhook for firebaseId: ${firebaseId}`);
      this.logger.log(`User identifier: ${user}`);
      this.logger.log(`Consent ID: ${payload.consent}`);

      // You can store the webhook data or trigger async processing here
      // For now, we'll just log it
      
      return {
        success: true,
        message: 'Webhook received and processed',
        firebaseId,
        consent: payload.consent,
      };
    }

    return {
      success: true,
      message: 'Webhook received',
    };
  }

  /**
   * Get user accounts from Feezback
   * Requires authentication
   */
  @Get('user-accounts')
  @UseGuards(FirebaseAuthGuard)
  async getUserAccounts(@Req() req: AuthenticatedRequest) {
    const firebaseId = req.user?.firebaseId;
    
    if (!firebaseId) {
      throw new Error('User ID not found — Firebase authentication required');
    }

    // Build sub identifier (same format as in consent JWT and webhook)
    // Format: {firebaseId}_sub (without @TPP_ID)
    // The @TPP_ID is added in the URL, not in the JWT sub field
    const sub = `${firebaseId}_sub`;

    this.logger.log(`Fetching accounts for firebaseId: ${firebaseId}, sub: ${sub}`);

    try {
      const accounts = await this.feezbackService.getUserAccounts(sub);
      return accounts;
    } catch (error: any) {
      this.logger.error(`Failed to fetch user accounts: ${error.message}`, error.stack);
      throw new Error(`Failed to fetch user accounts: ${error.message}`);
    }
  }
}


// import { Controller, Post, Body, Req } from '@nestjs/common';
// import { FeezbackService } from './feezback.service';

// @Controller('feezback')
// export class FeezbackController {
//   constructor(private readonly feezbackService: FeezbackService) {}

//   @Post('consent-link')
//   async getConsentLink(
//     @Body('context') context: string,
//     @Req() req: any,
//   ) {

//     console.log("consent-link: context=", context);
    
//     // Adjust this based on how YOU store user info in req.user
//     const userId = 'test-user-123';
//     // const userId =
//     //   req.user?.firebaseId ||
//     //   req.user?.uid ||   
//     //   req.user?.id;

//     if (!userId) {
//       throw new Error('User ID not found — is your Firebase auth middleware active?');
//     }

//     const link = await this.feezbackService.createConsentLink(userId, context);

//     return { link };
//   }
// }
