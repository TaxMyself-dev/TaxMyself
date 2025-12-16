import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class FeezbackJwtService {

  private readonly privateKey: string;

  constructor() {
    const keyPath =process.env.FEEZBACK_PRIVATE_KEY_PATH;
    console.log(`Loading Feezback private key from: ${keyPath}`);
    this.privateKey = fs.readFileSync(keyPath, 'utf8');
  }

  generateConsentJwt(userId: string, context: string): string {

    const payload: any =  {
      "sub": "someUser",
      "iss": "tpp/KNCAXnwXk1",
      "srv": "ais/user",
      // "iat": Math.floor(Date.now() / 1000),
      "iat": 1516239022,
      // "exp": Math.floor(Date.now() / 1000) + 600,
      "exp": 2516239022,
      "ttl": 600,
      "flow": {
        "id": "default",
        "dataBaskets": [
          "ACCOUNTS",
          "BALANCES",
          "TRANSACTIONS"
        ],
        "accountTypes": [
          "CACC",
          "CARD",
          "SVGS",
          "LOAN",
          "SCTS"
        ],
        "mandatoryDataBaskets": [
          "ACCOUNTS",
          "BALANCES"
        ],
        "timePeriods": [
          "ONE_DAY",
          "THREE_MONTHS",
          "SIX_MONTHS",
          "TWELVE_MONTHS"
        ],
        "defaultTimePeriod": "ONE_DAY",
        "userIdentifier": {
          "type": "ID",
          "value": "000000018",
          "editable": false
        },
        "context": "1111"
      }
    }

    // const payload: any = {
    //   sub: "someUser",
    //   iss: "tpp/KNCAXnwXk1",
    //   srv: "ais/user",
    //   iat: nowSec,
    //   exp: nowSec + 60 * 10, // תוקף 10 דקות
    //   ttl: 600,

    //   flow: {
    //     id: 'default',
    //     dataBaskets: ['ACCOUNTS', 'BALANCES', 'TRANSACTIONS'],
    //     accountTypes: ['CACC', 'CARD'],
    //     mandatoryDataBaskets: ['ACCOUNTS', 'BALANCES'],
    //     flags: {
    //       displaySuccessScreen: true,
    //       splitDataBasketsAndTimePeriodsScreen: false,
    //       hideDataBaskets: false,
    //       autoFillAspsp: false,
    //     },
    //     timePeriods: ['ONE_DAY', 'THREE_MONTHS', 'SIX_MONTHS', 'TWELVE_MONTHS'],
    //     defaultTimePeriod: 'ONE_DAY',

    //     // לפי פרטי המוק שקיבלת מהם
    //     userIdentifier: {
    //       type: 'ID',
    //       value: '216139683', // המזהה מהמייל שלהם
    //       editable: false,
    //     },

    //     context: context || 'dev-test',

    //     redirects: {
    //       success: process.env.FEEZBACK_REDIRECT_OK,
    //       failure: process.env.FEEZBACK_REDIRECT_NOK,
    //       ttlExpired: process.env.FEEZBACK_REDIRECT_EXP,
    //     },

    //     route: 'onboarding',
    //     userWasAuthenticated: true,
    //   },
    // };

    const token = jwt.sign(payload, this.privateKey, {
      algorithm: 'RS512', 
    });

    console.log(`Generated Feezback JWT for user ${userId}`);
    return token;
  }
}





// import { Injectable, Logger } from '@nestjs/common';
// import * as fs from 'fs';
// import * as jwt from 'jsonwebtoken';

// @Injectable()
// export class FeezbackJwtService {
//   private readonly logger = new Logger(FeezbackJwtService.name);
//   private privateKey: string;

//   constructor() {
//     const isProd = process.env.NODE_ENV === 'production';

//     if (isProd) {
//       // 🔐 Production — load from environment variable
//       this.logger.log('Loading Feezback private key from ENV (production mode)');

//       if (!process.env.FEEZBACK_PRIVATE_KEY) {
//         this.logger.error('❌ FEEZBACK_PRIVATE_KEY is missing in ENV variables!');
//         throw new Error('Missing Feezback private key in ENV');
//       }

//       // חשוב מאוד — להמיר '\n' לשורה אמיתית
//       this.privateKey = process.env.FEEZBACK_PRIVATE_KEY.replace(/\\n/g, '\n');
//     } else {
//       // 💻 Development — load from local file
//       // C:\Users\harel\Elazar Harel\taxmyself\eharel-branch-0\global\keys\private.key
//       const keyPath = '../global/keys/private.key';
//       // const keyPath = './keys/dev/feezback_private.key';
//       this.logger.log(`Loading Feezback private key from file: ${keyPath}`);

//       if (!fs.existsSync(keyPath)) {
//         this.logger.error(`❌ Private key not found at ${keyPath}`);
//         throw new Error(`Private key file is missing: ${keyPath}`);
//       }

//       this.privateKey = fs.readFileSync(keyPath, 'utf8');
//     }
//   }

//   /**
//    * Generate a JWT token for Feezback AIS consent creation
//    */
//   generateConsentToken(userId: string, context: string = 'default'): string {
//     const now = Math.floor(Date.now() / 1000); // שניות, לא מילישניות

//     // זה ה-Payload לפי הדרישות של Feezback
//     const payload: any = {
//       sub: userId,
//       encrypt: true,
//       iss: process.env.FEEZBACK_ISS || 'tpp/test',
//       srv: process.env.FEEZBACK_SRV || 'ais/user',
//       iat: now,
//       exp: now + 600, // 10 דקות תוקף
//       ttl: 600,
//       flow: {
//         id: 'default',
//         dataBaskets: ['ACCOUNTS', 'BALANCES', 'TRANSACTIONS'],
//         context: context,
//         redirects: {
//           success: process.env.FEEZBACK_REDIRECT_OK,
//           failure: process.env.FEEZBACK_REDIRECT_NOK,
//           ttlExpired: process.env.FEEZBACK_REDIRECT_EXP,
//         },
//         userWasAuthenticated: true,
//       },
//     };

//     this.logger.debug(`Generating Feezback JWT for user: ${userId}`);

//     try {
//       const token = jwt.sign(payload, this.privateKey, {
//         algorithm: 'RS256',
//       });

//       return token;
//     } catch (err) {
//       this.logger.error('❌ Failed to sign JWT for Feezback', err);
//       throw err;
//     }
//   }
// }
