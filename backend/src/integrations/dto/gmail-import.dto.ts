import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
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

  // NO businessNumber: which business receives the files is decided solely by
  // BusinessResolverService inside the import pipeline. A client cannot
  // choose, hint at, or override the destination.

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
