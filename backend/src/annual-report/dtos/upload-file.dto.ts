import { IsEnum, IsString } from 'class-validator';
import { AnnualReportDocCategory } from '../annual-report.entity';

export class UploadFileDto {
  @IsEnum(AnnualReportDocCategory)
  category: AnnualReportDocCategory;

  @IsString()
  filePath: string;

  @IsString()
  fileName: string;
}
