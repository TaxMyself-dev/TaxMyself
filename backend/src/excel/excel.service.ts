// excel.service.ts
import * as XLSX from 'xlsx';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ExcelService {
  readExcelFile(fileBuffer: Buffer): any[] {
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json(worksheet, { raw: true });
  }
}

