import { IsString, IsOptional, IsDateString, MaxLength } from 'class-validator';

export class CreateTaskDto {
  @IsString()
  clientFirebaseId: string;

  @IsString()
  businessNumber: string;

  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;
}
