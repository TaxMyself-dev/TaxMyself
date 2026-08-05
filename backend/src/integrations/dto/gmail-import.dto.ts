import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Body of POST /integrations/google/gmail/import (Phase D). */
export class GmailImportDto {
  /**
   * The Gmail accounts to import from — the user's selection in the manual
   * import dialog. Every id must be an ACTIVE Google integration owned by the
   * caller; the whole request is rejected otherwise.
   */
  @IsArray()
  @ArrayNotEmpty()
  @Type(() => Number)
  @IsInt({ each: true })
  integrationIds: number[];

  /**
   * Which business's Drive inbox receives the files — inbox/ lives per business.
   * Optional: when omitted, BusinessResolverService resolves the target business
   * (single business, or the primary for multi-business users).
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  businessNumber?: string;

  /** Optional Gmail search override; defaults to the reader's broad receipts query. */
  @IsOptional()
  @IsString()
  q?: string;

  /** How many Gmail messages to scan (reader clamps to 1–25, default 10). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(25)
  maxResults?: number;
}
