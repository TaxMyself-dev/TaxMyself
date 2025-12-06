import { Controller, Post, Body, Req } from '@nestjs/common';
import { FeezbackService } from './feezback.service';

@Controller('feezback')
export class FeezbackController {
  constructor(private readonly feezbackService: FeezbackService) {}

  @Post('consent-link')
  async getConsentLink(
    @Body('context') context: string,
    @Req() req: any,
  ) {

    console.log("consent-link: context=", context);
    
    // Adjust this based on how YOU store user info in req.user
    const userId = 'test-user-123';
    // const userId =
    //   req.user?.firebaseId ||
    //   req.user?.uid ||   
    //   req.user?.id;

    if (!userId) {
      throw new Error('User ID not found — is your Firebase auth middleware active?');
    }

    const link = await this.feezbackService.createConsentLink(userId, context);

    return { link };
  }
}
