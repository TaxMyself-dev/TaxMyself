import { IsString, Matches, MaxLength } from 'class-validator';

export class CreateAdminAccountingSectionDto {
  @IsString()
  @MaxLength(120)
  name: string;

  /** SYSTEM expense-section block anchor (60000, 60100, ... 69900). */
  @IsString()
  @Matches(/^6\d{2}00$/, { message: 'code must be a SYSTEM expense block anchor (60000-69900)' })
  code: string;
}
