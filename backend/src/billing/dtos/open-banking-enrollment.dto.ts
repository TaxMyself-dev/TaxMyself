import { IsInt, Matches, Min } from 'class-validator';
export class OpenBankingEnrollmentDto {
  @IsInt() @Min(1) planId: number;
  @Matches(/^[a-f0-9]{64}$/) quote: string;
}
export class CancelOpenBankingEnrollmentDto {
  @IsInt() @Min(1) expectedEventId: number;
  @IsInt() @Min(1) planId: number;
}
