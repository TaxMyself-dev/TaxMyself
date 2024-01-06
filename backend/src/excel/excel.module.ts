// excel.module.ts
import { Module } from '@nestjs/common';
import { ExcelService } from './excel.service';
import { ExcelController } from './excel.controller';

@Module({
  providers: [ExcelService],
  controllers: [ExcelController],
})
export class ExcelModule {}