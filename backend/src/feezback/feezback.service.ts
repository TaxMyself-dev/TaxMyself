import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { FeezbackJwtService } from './feezback-jwt.service';

@Injectable()
export class FeezbackService {
  private readonly logger = new Logger(FeezbackService.name);
  // private readonly lgsUrl = process.env.FEEZBACK_LGS_URL || 'https://lgs-integ01.feezback.cloud/link';
  private readonly lgsUrl = process.env.FEEZBACK_LGS_URL;

  constructor(
    private readonly http: HttpService,
    private readonly jwtService: FeezbackJwtService,
  ) {}

  async createConsentLink(userId: string, context: string = 'default'): Promise<string> {
    // 1) יוצרים JWT בעזרת השירות שבנית
    const token = this.jwtService.generateConsentToken(userId, context);

    this.logger.debug(`Creating Feezback consent link for userId=${userId}, context=${context}`);

    // 2) שולחים בקשה ל-Feezback עם ה-token בגוף
    try {
      const res = await firstValueFrom(
        this.http.post(this.lgsUrl, { token })
      );

      this.logger.log(`Feezback /link response: ${JSON.stringify(res.data)}`);

      // ⚠️ כאן לא 100% ידוע איך בדיוק נראה ה-response
      // אז עושים fallback חכם:
      const data = res.data;
      const link = data?.link || data?.url || data?.redirectUrl || data;

      if (!link || typeof link !== 'string') {
        this.logger.error(`Unexpected Feezback link response format: ${JSON.stringify(data)}`);
        throw new Error('Unexpected Feezback response, link not found');
      }

      return link;
    } catch (err) {
      this.logger.error('Error creating Feezback consent link', err);
      throw err;
    }
  }
}
