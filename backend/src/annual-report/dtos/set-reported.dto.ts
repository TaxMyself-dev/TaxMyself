import { IsBoolean } from 'class-validator';

export class SetReportedDto {
  @IsBoolean()
  reported: boolean;
}
