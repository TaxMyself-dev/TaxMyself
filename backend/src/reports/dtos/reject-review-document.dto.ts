import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectReviewDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string | null;
}
