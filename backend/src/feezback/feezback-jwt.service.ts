import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class FeezbackJwtService {
  private readonly logger = new Logger(FeezbackJwtService.name);
  private privateKey: string;

  constructor() {
    const isProd = process.env.NODE_ENV === 'production';

    if (isProd) {
      // 🔐 Production — load from environment variable
      this.logger.log('Loading Feezback private key from ENV (production mode)');

      if (!process.env.FEEZBACK_PRIVATE_KEY) {
        this.logger.error('❌ FEEZBACK_PRIVATE_KEY is missing in ENV variables!');
        throw new Error('Missing Feezback private key in ENV');
      }

      // חשוב מאוד — להמיר '\n' לשורה אמיתית
      this.privateKey = process.env.FEEZBACK_PRIVATE_KEY.replace(/\\n/g, '\n');
    } else {
      // 💻 Development — load from local file
      // C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0\global\keys\private.key
      const keyPath = '../global/keys/private.key';
      // const keyPath = './keys/dev/feezback_private.key';
      this.logger.log(`Loading Feezback private key from file: ${keyPath}`);

      if (!fs.existsSync(keyPath)) {
        this.logger.error(`❌ Private key not found at ${keyPath}`);
        throw new Error(`Private key file is missing: ${keyPath}`);
      }

      this.privateKey = fs.readFileSync(keyPath, 'utf8');
    }
  }

  /**
   * Generate a JWT token for Feezback AIS consent creation
   */
  generateConsentToken(userId: string, context: string = 'default'): string {
    const now = Math.floor(Date.now() / 1000); // שניות, לא מילישניות

    // זה ה-Payload לפי הדרישות של Feezback
    const payload: any = {
      sub: userId,
      encrypt: true,
      iss: process.env.FEEZBACK_ISS || 'tpp/test',
      srv: process.env.FEEZBACK_SRV || 'ais/user',
      iat: now,
      exp: now + 600, // 10 דקות תוקף
      ttl: 600,
      flow: {
        id: 'default',
        dataBaskets: ['ACCOUNTS', 'BALANCES', 'TRANSACTIONS'],
        context: context,
        redirects: {
          success: process.env.FEEZBACK_REDIRECT_OK,
          failure: process.env.FEEZBACK_REDIRECT_NOK,
          ttlExpired: process.env.FEEZBACK_REDIRECT_EXP,
        },
        userWasAuthenticated: true,
      },
    };

    this.logger.debug(`Generating Feezback JWT for user: ${userId}`);

    try {
      const token = jwt.sign(payload, this.privateKey, {
        algorithm: 'RS256',
      });

      return token;
    } catch (err) {
      this.logger.error('❌ Failed to sign JWT for Feezback', err);
      throw err;
    }
  }
}
