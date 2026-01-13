import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom, timeout } from 'rxjs';
import axios from 'axios';
import { FeezbackJwtService } from './feezback-jwt.service';

@Injectable()
export class FeezbackService {
  private readonly logger = new Logger(FeezbackService.name);
  private readonly lgsUrl: string;
  private readonly tokenUrl: string;
  private readonly tppApiUrl: string;
  private readonly tppId: string = 'KNCAXnwXk1';

  constructor(
    private readonly http: HttpService,
    private readonly feezbackJwtService: FeezbackJwtService,
  ) {

    this.lgsUrl = 'https://proxy-146140406969.me-west1.run.app/proxy/feezback/link';
    // For production: use 'https://lgs-prod.feezback.cloud/token' and 'https://prod-tpp.feezback.cloud'
    this.tokenUrl = 'https://proxy-146140406969.me-west1.run.app/proxy/feezback/token';
    this.tppApiUrl = 'https://proxy-146140406969.me-west1.run.app/proxy/feezback';
    this.logger.log(`Feezback LGS URL: ${this.lgsUrl}`);
    this.logger.log(`Feezback Token URL: ${this.tokenUrl}`);
    this.logger.log(`Feezback TPP API URL: ${this.tppApiUrl}`);

  }

  async createConsentLink(firebaseId: string) {
    try {
      const token = await this.feezbackJwtService.generateConsentJwt(firebaseId);
      console.log("firebaseId: ", firebaseId);
      console.log("token: ", token);

      this.logger.debug(`Sending token to Feezback LGS URL: ${this.lgsUrl}`);

      const response$ = this.http.post(this.lgsUrl, { token });
      const { data } = await firstValueFrom(response$);

      this.logger.debug(`Feezback response: ${JSON.stringify(data)}`);
      return data;
    } catch (error: any) {
      this.logger.error(
        `Error calling Feezback LGS: ${error?.message}`,
        error?.stack,
      );

      if (error?.response?.data) {
        this.logger.error(
          `Feezback error response: ${JSON.stringify(error.response.data)}`,
        );
      }

      throw error;
    }
  }

  /**
   * Gets an access token from Feezback for accessing user data
   * @param sub - User identifier (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_sub")
   * @returns Access token string
   */
  async getAccessToken(sub: string): Promise<string> {
    try {
      // Generate JWT token for accessing user data
      const jwtToken = this.feezbackJwtService.generateAccessToken(sub);
      console.log("jwtToken: ", jwtToken);

      this.logger.debug(`Requesting access token from: ${this.tokenUrl}`);

      // Request access token from Feezback
      const response = await axios.post(this.tokenUrl, { token: jwtToken });
      const data = response.data;

      this.logger.debug(`Access token response: ${JSON.stringify(data)}`);

      // Extract token from response
      const accessToken = data?.token;
      
      if (!accessToken || typeof accessToken !== 'string') {
        throw new Error('Invalid access token response format');
      }

      return accessToken;
    } catch (error: any) {
      this.logger.error(
        `Error getting access token: ${error?.message}`,
        error?.stack,
      );

      if (error?.response?.data) {
        this.logger.error(
          `Feezback error response: ${JSON.stringify(error.response.data)}`,
        );
      }

      throw error;
    }
  }

  /**
   * Gets user accounts data from Feezback
   * @param sub - User identifier (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_sub")
   * @returns User accounts data
   */
  async getUserAccounts(sub: string): Promise<any> {
    try {
      this.logger.log(`Getting user accounts for sub: ${sub}`);
      
      // Get access token first
      const accessToken = await this.getAccessToken(sub);
      this.logger.log(`Access token received (length: ${accessToken})`);
      
      // Build the user identifier with TPP ID
      // Format: {sub}@TPP_ID (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_sub@KNCAXnwXk1")
      const userIdentifier = `${sub}@${this.tppId}`;
      const accountsUrl = `${this.tppApiUrl}/tpp/v1/users/${userIdentifier}/accounts`;
      // const accountsUrl = `${this.tppApiUrl}/tpp/v1/users/${userIdentifier}`;

      this.logger.log(`Requesting accounts from URL: ${accountsUrl}`);
      this.logger.log(`User identifier: ${userIdentifier}`);

      // Request user accounts with timeout
      this.logger.debug(`Making GET request to: ${accountsUrl}`);
      this.logger.debug(`Authorization header: Bearer ${accessToken.substring(0, 20)}...`);
      
      const response = await axios.get(accountsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
        timeout: 60000, // 60 seconds timeout (configured in axios)
      });
      
      this.logger.debug(`Waiting for response...`);
      const data = response.data;

      this.logger.debug(`User accounts response: ${JSON.stringify(data)}`);
      return data;
    } catch (error: any) {
      this.logger.error(
        `Error getting user accounts: ${error?.message}`,
        error?.stack,
      );

      if (error?.response?.data) {
        this.logger.error(
          `Feezback error response: ${JSON.stringify(error.response.data)}`,
        );
      }

      throw error;
    }
  }

  /**
   * Extracts firebaseId from context string
   * @param context - Context string (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_context")
   * @returns Firebase ID
   */
  extractFirebaseIdFromContext(context: string): string {
    if (context.endsWith('_context')) {
      return context.replace('_context', '');
    }
    return context;
  }

  /**
   * Extracts sub from user identifier
   * @param user - User identifier (e.g., "AxFm5xBcYlMTV5kb5OAnde5Rbh62_sub@KNCAXnwXk1")
   * @returns Sub identifier
   */
  extractSubFromUser(user: string): string {
    // Remove @TPP_ID part
    const parts = user.split('@');
    return parts[0];
  }
}




// import { HttpService } from '@nestjs/axios';
// import { Injectable, Logger } from '@nestjs/common';
// import { firstValueFrom } from 'rxjs';
// import { FeezbackJwtService } from './feezback-jwt.service';

// @Injectable()
// export class FeezbackService {
//   private readonly logger = new Logger(FeezbackService.name);
//   // private readonly lgsUrl = process.env.FEEZBACK_LGS_URL || 'https://lgs-integ01.feezback.cloud/link';
//   private readonly lgsUrl = process.env.FEEZBACK_LGS_URL;

//   constructor(
//     private readonly http: HttpService,
//     private readonly jwtService: FeezbackJwtService,
//   ) {}

//   async createConsentLink(userId: string, context: string = 'default'): Promise<string> {
//     // 1) יוצרים JWT בעזרת השירות שבנית
//     const token = this.jwtService.generateConsentToken(userId, context);

//     this.logger.debug(`Creating Feezback consent link for userId=${userId}, context=${context}`);

//     // 2) שולחים בקשה ל-Feezback עם ה-token בגוף
//     try {
//       const res = await firstValueFrom(
//         this.http.post(this.lgsUrl, { token })
//       );

//       this.logger.log(`Feezback /link response: ${JSON.stringify(res.data)}`);

//       // ⚠️ כאן לא 100% ידוע איך בדיוק נראה ה-response
//       // אז עושים fallback חכם:
//       const data = res.data;
//       const link = data?.link || data?.url || data?.redirectUrl || data;

//       if (!link || typeof link !== 'string') {
//         this.logger.error(`Unexpected Feezback link response format: ${JSON.stringify(data)}`);
//         throw new Error('Unexpected Feezback response, link not found');
//       }

//       return link;
//     } catch (err) {
//       this.logger.error('Error creating Feezback consent link', err);
//       throw err;
//     }
//   }
// }
