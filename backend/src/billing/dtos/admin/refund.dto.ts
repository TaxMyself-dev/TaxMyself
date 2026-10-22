import { IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, Matches } from 'class-validator';

export class CreateRefundDto {
  @IsUUID() requestId: string;
  @IsInt() @Min(1) paymentEventId: number;
  @IsInt() @Min(1) amountAgorot: number;
  @IsString() @MinLength(3) @MaxLength(500) reason: string;
}

export class ResolveRefundDto {
  @IsIn(['COMPLETE', 'CONFIRM_REFUNDED', 'CONFIRM_NOT_REFUNDED']) action: 'COMPLETE' | 'CONFIRM_REFUNDED' | 'CONFIRM_NOT_REFUNDED';
  @IsInt() @Min(0) expectedStateVersion: number;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(500) evidence?: string;
  @IsOptional() @IsString() @Matches(/^[1-9]\d{0,15}$/) transactionId?: string;
}
