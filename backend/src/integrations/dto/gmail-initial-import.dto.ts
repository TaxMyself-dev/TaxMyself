import { Type } from 'class-transformer';
import { IsInt, IsString, Matches, Min } from 'class-validator';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Body of POST /integrations/google/gmail/import-initial.
 *
 * The initial import is per connected Gmail account, so integrationId selects
 * which mailbox to import. Only the shape is validated here — ownership and
 * the range rules (dynamic minimum of Jan 1 of the previous year, toDate not
 * in the future, fromDate <= toDate) live in GmailSyncService.
 * No free-text Gmail query is accepted: the service builds it from the dates.
 */
export class GmailInitialImportDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  integrationId: number;

  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'fromDate must be formatted YYYY-MM-DD' })
  fromDate: string;

  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'toDate must be formatted YYYY-MM-DD' })
  toDate: string;
}
