import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

/** Body of POST /integrations/google/gmail/import (Phase D). */
export class GmailImportDto {
  /** Which business's Drive inbox receives the files — inbox/ lives per business. */
  @IsString()
  @IsNotEmpty()
  businessNumber: string;

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
