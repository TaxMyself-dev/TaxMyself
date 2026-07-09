import { IsString, Matches } from 'class-validator';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Body of POST /integrations/google/gmail/import-initial.
 *
 * Only the shape is validated here — the range rules (dynamic minimum of
 * Jan 1 of the previous year, toDate not in the future, fromDate <= toDate)
 * live in GmailSyncService because the boundaries are computed per request.
 * No free-text Gmail query is accepted: the service builds it from the dates.
 */
export class GmailInitialImportDto {
  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'fromDate must be formatted YYYY-MM-DD' })
  fromDate: string;

  @IsString()
  @Matches(ISO_DATE_PATTERN, { message: 'toDate must be formatted YYYY-MM-DD' })
  toDate: string;
}
