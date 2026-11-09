import { ArrayNotEmpty, IsArray, IsInt, IsString, Length, Min } from 'class-validator';

export class SettleDebtDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  obligationIds: number[];

  @IsString()
  @Length(16, 255)
  recoveryQuote: string;
}
