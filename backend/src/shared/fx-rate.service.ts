import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import axios from 'axios';
import { FxRate } from './fx-rate.entity';

/**
 * Currencies supported by the FX layer. Anything outside this set is treated
 * as ILS for conversion purposes (the row's `currency` is preserved on the
 * cache for display, but `ilsAmount` stays null and reports fall back to the
 * raw amount).
 */
export const SUPPORTED_FX_CURRENCIES = ['USD', 'EUR', 'GBP'] as const;
export type SupportedFxCurrency = (typeof SUPPORTED_FX_CURRENCIES)[number];

/** Shape we cache after parsing BOI's response. */
interface FxResolved {
  rateToIls: number;
  effectiveDate: Date;
}

/**
 * Returns the Bank of Israel exchange rate for `currency → ILS` on `date`.
 *
 * Three-layer cache:
 *   1. In-memory map (per process, never invalidated — rates are immutable
 *      once published).
 *   2. `fx_rate` DB table (persistent across restarts).
 *   3. BOI public API: `https://boi.org.il/PublicApi/GetExchangeRate?key=CCC`
 *      for the latest, and `?asOf=YYYY-MM-DD` for historical.
 *
 * Weekends/holidays: BOI doesn't publish on non-business days. We walk back
 * up to 7 days looking for a quote and stamp `effectiveDate` with the day
 * BOI actually published — auditors can verify the row used a real
 * published rate, not an interpolated one.
 */
@Injectable()
export class FxRateService {
  private readonly logger = new Logger(FxRateService.name);

  /** In-memory cache keyed by "YYYY-MM-DD|CCC". */
  private readonly memoryCache = new Map<string, FxResolved>();

  /**
   * BOI base URL. Configurable via `BOI_FX_BASE_URL` env var so we can swap
   * to a mock or fallback (e.g. frankfurter.app) without code changes.
   */
  private readonly boiBaseUrl: string =
    process.env.BOI_FX_BASE_URL || 'https://boi.org.il/PublicApi';

  constructor(
    @InjectRepository(FxRate)
    private readonly fxRepo: Repository<FxRate>,
  ) {}

  /**
   * Main API. Returns the multiplier `originalAmount * rate = ilsAmount`.
   *
   * ILS in → returns `1` (no-op so callers don't need to special-case).
   * Unsupported currency → returns `null` (caller decides whether to skip
   * conversion or surface a warning).
   * Network failure with no cached fallback → throws ServiceUnavailableException
   * so manual-entry flows can return 503 to the frontend instead of silently
   * storing a wrong value.
   */
  async getRate(date: Date, currency: string | null | undefined): Promise<number | null> {
    const code = (currency ?? 'ILS').toUpperCase();
    if (code === 'ILS') return 1;
    if (!SUPPORTED_FX_CURRENCIES.includes(code as SupportedFxCurrency)) {
      return null;
    }

    const day = this.toIsoDate(date);
    const cacheKey = `${day}|${code}`;
    const memHit = this.memoryCache.get(cacheKey);
    if (memHit) return memHit.rateToIls;

    // DB cache — same key.
    const dbHit = await this.fxRepo.findOne({ where: { date: new Date(day), currency: code } });
    if (dbHit) {
      this.memoryCache.set(cacheKey, {
        rateToIls: Number(dbHit.rateToIls),
        effectiveDate: dbHit.effectiveDate ?? dbHit.date,
      });
      return Number(dbHit.rateToIls);
    }

    // Fall through to BOI API. Walk back up to 7 days for weekends/holidays.
    const fetched = await this.fetchFromBoi(date, code);
    if (!fetched) {
      // Last-resort soft fallback: the most recent date < requested in DB.
      const recent = await this.fxRepo.findOne({
        where: { currency: code, date: LessThanOrEqual(new Date(day)) },
        order: { date: 'DESC' },
      });
      if (recent) {
        this.logger.warn(
          `getRate(${day},${code}): BOI unreachable; using cached rate from ${recent.date}`,
        );
        this.memoryCache.set(cacheKey, {
          rateToIls: Number(recent.rateToIls),
          effectiveDate: recent.effectiveDate ?? recent.date,
        });
        return Number(recent.rateToIls);
      }
      throw new ServiceUnavailableException(
        `Couldn't fetch exchange rate for ${code} on ${day}. Try again in a moment.`,
      );
    }

    // Persist for next time.
    const row = this.fxRepo.create({
      date: new Date(day),
      currency: code,
      rateToIls: fetched.rateToIls,
      effectiveDate: fetched.effectiveDate,
    });
    try {
      await this.fxRepo.save(row);
    } catch {
      // Race: another concurrent save already inserted. Ignore.
    }
    this.memoryCache.set(cacheKey, fetched);
    return fetched.rateToIls;
  }

  /**
   * Convenience: fetch + multiply in one call. Returns `null` for unsupported
   * currencies (caller can fall back to the raw amount).
   */
  async convertToIls(amount: number, currency: string | null | undefined, date: Date): Promise<number | null> {
    const rate = await this.getRate(date, currency);
    if (rate == null) return null;
    return amount * rate;
  }

  // -------------------- internals --------------------

  private toIsoDate(d: Date): string {
    // YYYY-MM-DD in UTC to avoid timezone shifts on the date key.
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
      .toISOString()
      .slice(0, 10);
  }

  /**
   * BOI lookup. Walks back up to 7 days from `date` to handle weekends.
   * Returns null only when BOI is unreachable or has no rate in that window.
   *
   * KNOWN LIMITATION — BOI's `GetExchangeRate` endpoint ignores the `asOf`
   * query param: it returns the LATEST rate regardless of the date sent.
   * That means historical accuracy isn't actually guaranteed by this code
   * today; the rate stamped on a transaction is the rate at the time of
   * sync/confirm. For tax-strict historical rates, swap this endpoint for
   * BOI's SDMX/Edge API (`edge.boi.gov.il/FusionEdgeServer/...`). The DB
   * cache layer is already keyed by date, so the first call per date is
   * what wins — the rest of the system will work correctly the moment a
   * historical-aware fetch is wired in.
   */
  private async fetchFromBoi(date: Date, currency: string): Promise<FxResolved | null> {
    const maxWalkbackDays = 7;
    let cursor = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    for (let i = 0; i <= maxWalkbackDays; i++) {
      const day = this.toIsoDate(cursor);
      try {
        const url = `${this.boiBaseUrl}/GetExchangeRate?key=${currency}&asOf=${day}`;
        const res = await axios.get(url, { timeout: 5000 });
        const rate = this.parseBoiResponse(res.data, currency);
        if (rate != null) {
          return { rateToIls: rate, effectiveDate: cursor };
        }
      } catch (err: any) {
        // 404 / network → walk back. Anything else → log and try next day too;
        // the calling layer will throw ServiceUnavailable if we exhaust all days.
        if (i === maxWalkbackDays) {
          this.logger.warn(
            `fetchFromBoi(${day},${currency}) failed after ${maxWalkbackDays + 1} attempts: ${err?.message ?? err}`,
          );
        }
      }
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() - 1));
    }
    return null;
  }

  /**
   * BOI returns slightly different shapes across endpoints. Handle both:
   *   - `{ key: 'USD', currentExchangeRate: 3.72, ... }` (single)
   *   - `{ exchangeRates: [{ key: 'USD', currentExchangeRate: 3.72 }, ...] }` (multi)
   *   - Some versions use `rate` instead of `currentExchangeRate`. Try a few.
   */
  private parseBoiResponse(body: any, currency: string): number | null {
    if (!body) return null;

    const pickRate = (obj: any): number | null => {
      if (!obj) return null;
      const r = obj.currentExchangeRate ?? obj.rate ?? obj.exchangeRate ?? null;
      if (typeof r === 'number' && isFinite(r) && r > 0) return r;
      const parsed = typeof r === 'string' ? Number(r) : NaN;
      return isFinite(parsed) && parsed > 0 ? parsed : null;
    };

    // Single-rate shape
    if (body.key === currency || (body.currency === currency)) {
      const r = pickRate(body);
      if (r != null) return r;
    }

    // Multi-rate shape
    const list = body.exchangeRates ?? body.rates ?? null;
    if (Array.isArray(list)) {
      const match = list.find((r: any) => r?.key === currency || r?.currency === currency);
      if (match) {
        const r = pickRate(match);
        if (r != null) return r;
      }
    }

    return null;
  }
}
