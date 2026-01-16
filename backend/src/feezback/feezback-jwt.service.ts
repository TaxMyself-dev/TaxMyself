import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';
import { User } from '../users/user.entity';

@Injectable()
export class FeezbackJwtService {
  private readonly logger = new Logger(FeezbackJwtService.name);
  private readonly privateKey: string;
  private readonly baseRedirectUrl: string;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    const keyPath = process.env.FEEZBACK_PRIVATE_KEY_PATH;
    // console.log(`Loading Feezback private key from: ${keyPath}`);
    this.privateKey = fs.readFileSync(keyPath, 'utf8');
    
    // Base URL for redirects - should be your frontend URL
    this.baseRedirectUrl = process.env.FEEZBACK_REDIRECT_BASE_URL || 
      process.env.FRONTEND_URL || 
      'http://localhost:4200';
  }

  /**
   * Builds redirect URLs for Feezback consent flow
   * @param flowId - The flow ID (default: "default")
   * @param context - The context identifier (firebaseId)
   * @returns Object with success, failure, and ttlExpired redirect URLs
   */
  private buildRedirectUrls(flowId: string, context: string): {
    success: string;
    failure: string;
    ttlExpired: string;
  } {
    const baseUrl = this.baseRedirectUrl.endsWith('/') 
      ? this.baseRedirectUrl.slice(0, -1) 
      : this.baseRedirectUrl;

    return {
      success: `${baseUrl}/feezback/success/${flowId}?context=${context}`,
      failure: `${baseUrl}/feezback/failure/${flowId}?context=${context}`,
      ttlExpired: `${baseUrl}/feezback/expired/${flowId}?context=${context}`,
    };
  }

  async generateConsentJwt(firebaseId: string): Promise<string> {
    const flowId = 'default'; // קבוע
    const context = firebaseId; // context = firebaseId
    const redirects = this.buildRedirectUrls(flowId, context);

    // Get user from database to retrieve the ID
    const user = await this.userRepository.findOne({ 
      where: { firebaseId } 
    });

    if (!user) {
      throw new Error(`User with firebaseId ${firebaseId} not found`);
    }

    const userId = user.id; // Get the user's ID from database

    const payload: any = {
      "sub": firebaseId + "_sub",
      "encrypt": true,
      "iss": "tpp/KNCAXnwXk1",
      "srv": "ais/user",
      "iat": Math.floor(Date.now() / 1000),
      "exp": Math.floor(Date.now() / 1000) + 3600, // 1 hour expiration
      "ttl": 600,
      "flow": {
        "id": flowId, // "default"
        "dataBaskets": [
          "ACCOUNTS",
          "BALANCES",
          "TRANSACTIONS"
        ],
        "accountTypes": [
          "CACC",
          "CARD"
        ],
        "mandatoryDataBaskets": [
          "ACCOUNTS",
          "BALANCES"
        ],
        "flags": {
          "displaySuccessScreen": true,
          "splitDataBasketsAndTimePeriodsScreen": false,
          "hideDataBaskets": false,
          "autoFillAspsp": false
        },
        "timePeriods": [
          "ONE_DAY",
          "THREE_MONTHS",
          "SIX_MONTHS",
          "TWELVE_MONTHS"
        ],
        "defaultTimePeriod": "ONE_DAY",
        "userIdentifier": {
          "type": "ID",
          "value": userId,
          "editable": false
        },
        "context": firebaseId + "_context",
        "redirects": redirects,
        "route": "onboarding",
        "userWasAuthenticated": true
      }
    };

    // console.log("private key is ", this.privateKey);
    // console.log("Redirect URLs:", JSON.stringify(redirects, null, 2));
    // console.log(`User ID for firebaseId ${firebaseId}: ${userId}`);

    const token = jwt.sign(payload, this.privateKey, {
      algorithm: 'RS512', 
    });

    // console.log(`Generated Feezback JWT for user ${firebaseId}`);
    return token;
  }

  /**
   * Generates a JWT token for accessing user data from Feezback
   * @param sub - User identifier (from webhook: user field without @TPP_ID)
   * @returns Signed JWT token
   */
  generateAccessToken(sub: string): string {
    const tppId = 'KNCAXnwXk1'; // TPP ID
    const currentTime = Math.floor(Date.now() / 1000);
    const expirationTime = currentTime + 3600; // 1 hour
    const ttl = 600; // 10 minutes

    // this.logger.debug(`Generating access token for sub: ${sub}`);

    const payload: any = {
      "sub": sub, // רק ה-sub, בלי @TPP_ID (זה מתווסף ב-URL)
      "iss": `tpp/${tppId}`,
      "srv": "ais/tpp",
      "iat": currentTime,
      "exp": expirationTime,
      "ttl": ttl,
      "encrypt": true
    };

    const token = jwt.sign(payload, this.privateKey, {
      algorithm: 'RS512',
    });

    // this.logger.debug(`Generated access token JWT`);
    return token;
  }
}