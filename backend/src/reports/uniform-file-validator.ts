import * as iconv from 'iconv-lite';
import { FIELD_MAP } from '../enum';

type UniformRecordCode = keyof typeof FIELD_MAP;

export interface UniformFileValidationIssue {
  file: 'INI.TXT' | 'BKMVDATA.TXT';
  line?: number;
  code?: string;
  message: string;
}

export class UniformFileValidationError extends Error {
  constructor(public readonly issues: UniformFileValidationIssue[]) {
    super(`Uniform file validation failed: ${issues.map((issue) => issue.message).join('; ')}`);
    this.name = 'UniformFileValidationError';
  }
}

const expectedRecordLength = (code: UniformRecordCode): number =>
  FIELD_MAP[code].reduce((sum, field) => sum + field.length, 0);

const DIGIT_FIELDS = new Set([
  'f_1002', 'f_1003', 'f_1004', 'f_1006', 'f_1009', 'f_1011', 'f_1013',
  'f_1014', 'f_1015', 'f_1016', 'f_1023', 'f_1028', 'f_1029', 'f_1034',
  'f_1101', 'f_1102', 'f_1103', 'f_1151', 'f_1152', 'f_1153', 'f_1155',
  'f_1201', 'f_1202', 'f_1203', 'f_1204', 'f_1211', 'f_1215', 'f_1228', 'f_1231', 'f_1234',
  'f_1251', 'f_1252', 'f_1253', 'f_1254', 'f_1255', 'f_1256', 'f_1257',
  'f_1258', 'f_1259', 'f_1268', 'f_1270', 'f_1273', 'f_1274',
  'f_1301', 'f_1302', 'f_1303', 'f_1304', 'f_1305', 'f_1306', 'f_1307',
  'f_1308', 'f_1309', 'f_1310', 'f_1313', 'f_1315', 'f_1320', 'f_1323',
  'f_1351', 'f_1352', 'f_1353', 'f_1354', 'f_1355', 'f_1358', 'f_1360',
  'f_1366', 'f_1374', 'f_1401', 'f_1402', 'f_1410', 'f_1417', 'f_1419',
  'f_1421', 'f_1451', 'f_1452', 'f_1463', 'f_1464',
]);

const DATE_FIELDS = new Set([
  'f_1024', 'f_1025', 'f_1026', 'f_1205', 'f_1216', 'f_1230',
  'f_1272', 'f_1311', 'f_1322', 'f_1362', 'f_1363', 'f_1375',
]);

const TIME_FIELDS = new Set(['f_1027', 'f_1206']);

const SIGNED_AMOUNT_FIELDS = new Set([
  'f_1217', 'f_1219', 'f_1220', 'f_1221', 'f_1222', 'f_1223', 'f_1224',
  'f_1264', 'f_1265', 'f_1266', 'f_1267', 'f_1312', 'f_1368', 'f_1369',
  'f_1370', 'f_1414', 'f_1415', 'f_1416', 'f_1422', 'f_1460', 'f_1461',
  'f_1462',
]);

const DOCUMENT_TYPES_REQUIRING_LINES = new Set(['100', '300', '305', '320', '330']);
const DOCUMENT_TYPES_REQUIRING_PAYMENTS = new Set(['320', '400']);

function extractFields(record: string, code: UniformRecordCode): Record<string, string> {
  let offset = 0;
  return Object.fromEntries(FIELD_MAP[code].map(({ field, length }) => {
    const value = record.slice(offset, offset + length);
    offset += length;
    return [field, value];
  }));
}

const isPlaceholder = (value: string): boolean => /^[! ]+$/.test(value);

const documentKey = (businessNumber: string, documentType: string, documentNumber: string): string =>
  `${businessNumber}|${documentType}|${documentNumber}`;

const parseSignedAmount = (value: string): number => Number(value) / 100;

function isValidDate(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false;
  if (value === '00000000') return true;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function validateFieldSemantics(
  file: UniformFileValidationIssue['file'],
  records: string[],
  issues: UniformFileValidationIssue[],
): void {
  records.forEach((record, index) => {
    const code = record.slice(0, 4) as UniformRecordCode;
    if (!(code in FIELD_MAP) || record.length !== expectedRecordLength(code)) return;
    const fields = extractFields(record, code);

    for (const [field, value] of Object.entries(fields)) {
      if (DIGIT_FIELDS.has(field) && !isPlaceholder(value) && !/^\d+$/.test(value)) {
        issues.push({ file, line: index + 1, code, message: `${code} ${field} must contain digits only` });
      }
      if (SIGNED_AMOUNT_FIELDS.has(field) && !/^[+-]\d+$/.test(value)) {
        issues.push({ file, line: index + 1, code, message: `${code} ${field} must contain a sign followed by digits` });
      }
      if (DATE_FIELDS.has(field) && !isPlaceholder(value) && !isValidDate(value)) {
        issues.push({ file, line: index + 1, code, message: `${code} ${field} must be a valid YYYYMMDD date` });
      }
      if (TIME_FIELDS.has(field) && !isPlaceholder(value)) {
        const hour = Number(value.slice(0, 2));
        const minute = Number(value.slice(2, 4));
        if (!/^\d{4}$/.test(value) || hour > 23 || minute > 59) {
          issues.push({ file, line: index + 1, code, message: `${code} ${field} must be a valid HHmm time` });
        }
      }
    }

    const systemConstant = fields.f_1005 ?? fields.f_1104 ?? fields.f_1154;
    if (systemConstant !== undefined && systemConstant !== '&OF1.31&') {
      issues.push({ file, line: index + 1, code, message: `${code} system constant must be &OF1.31&` });
    }
  });
}

function splitRecords(
  file: UniformFileValidationIssue['file'],
  content: string,
  issues: UniformFileValidationIssue[],
): string[] {
  if (!content.endsWith('\r\n')) {
    issues.push({ file, message: `${file} must end with CRLF` });
  }
  if (/(^|[^\r])\n|\r(?!\n)/.test(content)) {
    issues.push({ file, message: `${file} contains a non-CRLF line ending` });
  }
  const records = content.split('\r\n');
  if (records.at(-1) === '') records.pop();
  return records;
}

function validateRecordLengths(
  file: UniformFileValidationIssue['file'],
  records: string[],
  issues: UniformFileValidationIssue[],
): void {
  records.forEach((record, index) => {
    const code = record.slice(0, 4);
    if (!(code in FIELD_MAP)) {
      issues.push({ file, line: index + 1, code, message: `${file} line ${index + 1} has unknown record code ${code}` });
      return;
    }
    const expected = file === 'INI.TXT' && code !== 'A000'
      ? 19
      : expectedRecordLength(code as UniformRecordCode);
    const actual = iconv.encode(record, 'windows-1255').length;
    if (actual !== expected) {
      issues.push({
        file,
        line: index + 1,
        code,
        message: `${file} line ${index + 1} (${code}) is ${actual} bytes; expected ${expected}`,
      });
    }
  });
}

export function validateUniformFileContents(
  iniContent: string,
  bkmvdataContent: string,
): UniformFileValidationIssue[] {
  const issues: UniformFileValidationIssue[] = [];
  const iniRecords = splitRecords('INI.TXT', iniContent, issues);
  const dataRecords = splitRecords('BKMVDATA.TXT', bkmvdataContent, issues);
  validateRecordLengths('INI.TXT', iniRecords, issues);
  validateRecordLengths('BKMVDATA.TXT', dataRecords, issues);
  validateFieldSemantics('INI.TXT', iniRecords.slice(0, 1), issues);
  validateFieldSemantics('BKMVDATA.TXT', dataRecords, issues);

  if (iniRecords[0]?.slice(0, 4) !== 'A000') {
    issues.push({ file: 'INI.TXT', line: 1, message: 'INI.TXT must start with A000' });
  }
  if (dataRecords[0]?.slice(0, 4) !== 'A100') {
    issues.push({ file: 'BKMVDATA.TXT', line: 1, message: 'BKMVDATA.TXT must start with A100' });
  }
  if (dataRecords.at(-1)?.slice(0, 4) !== 'Z900') {
    issues.push({ file: 'BKMVDATA.TXT', line: dataRecords.length, message: 'BKMVDATA.TXT must end with Z900' });
  }

  dataRecords.forEach((record, index) => {
    const value = record.slice(4, 13);
    const expected = String(index + 1).padStart(9, '0');
    if (value !== expected) {
      issues.push({
        file: 'BKMVDATA.TXT',
        line: index + 1,
        code: record.slice(0, 4),
        message: `BKMVDATA.TXT line ${index + 1} has record number ${value}; expected ${expected}`,
      });
    }
  });

  const documentLines = new Map<string, { line: number; amountBeforeDiscount: number }[]>();
  const documentPayments = new Map<string, { line: number; amount: number }[]>();
  dataRecords.forEach((record, index) => {
    if (record.startsWith('D110')) {
      const fields = extractFields(record, 'D110');
      const key = documentKey(fields.f_1252, fields.f_1253, fields.f_1254);
      const rows = documentLines.get(key) ?? [];
      rows.push({ line: index + 1, amountBeforeDiscount: parseSignedAmount(fields.f_1267) });
      documentLines.set(key, rows);
    }
    if (record.startsWith('D120')) {
      const fields = extractFields(record, 'D120');
      const key = documentKey(fields.f_1302, fields.f_1303, fields.f_1304);
      const rows = documentPayments.get(key) ?? [];
      rows.push({ line: index + 1, amount: parseSignedAmount(fields.f_1312) });
      documentPayments.set(key, rows);
    }
  });

  dataRecords.forEach((record, index) => {
    if (!record.startsWith('C100')) return;
    const fields = extractFields(record, 'C100');
    const key = documentKey(fields.f_1202, fields.f_1203, fields.f_1204);
    const lines = documentLines.get(key) ?? [];
    const payments = documentPayments.get(key) ?? [];
    const documentType = fields.f_1203;

    if (DOCUMENT_TYPES_REQUIRING_LINES.has(documentType) && lines.length === 0) {
      issues.push({
        file: 'BKMVDATA.TXT', line: index + 1, code: 'C100',
        message: `C100 document type ${documentType} number ${fields.f_1204} has no matching D110 record`,
      });
    }
    if (DOCUMENT_TYPES_REQUIRING_PAYMENTS.has(documentType) && payments.length === 0) {
      issues.push({
        file: 'BKMVDATA.TXT', line: index + 1, code: 'C100',
        message: `C100 document type ${documentType} number ${fields.f_1204} has no matching D120 record`,
      });
    }

    if (lines.length > 0) {
      const c100AmountBeforeDiscount = parseSignedAmount(fields.f_1219);
      const d110AmountBeforeDiscount = lines.reduce((sum, row) => sum + row.amountBeforeDiscount, 0);
      if (Math.abs(c100AmountBeforeDiscount - d110AmountBeforeDiscount) > 0.005) {
        issues.push({
          file: 'BKMVDATA.TXT', line: index + 1, code: 'C100',
          message: `C100 document type ${documentType} number ${fields.f_1204} amount 1219 does not match D110 amount 1267`,
        });
      }
    }
    if (payments.length > 0) {
      const c100Total = parseSignedAmount(fields.f_1223);
      const d120Total = payments.reduce((sum, row) => sum + row.amount, 0);
      if (Math.abs(c100Total - d120Total) > 0.005) {
        issues.push({
          file: 'BKMVDATA.TXT', line: index + 1, code: 'C100',
          message: `C100 document type ${documentType} number ${fields.f_1204} amount 1223 does not match D120 amount 1312`,
        });
      }
    }
  });

  const expectedTotal = dataRecords.length;
  const iniTotal = Number(iniRecords[0]?.slice(9, 24));
  if (iniTotal !== expectedTotal) {
    issues.push({ file: 'INI.TXT', line: 1, code: 'A000', message: `A000 total is ${iniTotal}; expected ${expectedTotal}` });
  }
  const closing = dataRecords.at(-1);
  const closingTotal = closing?.startsWith('Z900') ? Number(closing.slice(45, 60)) : NaN;
  if (closingTotal !== expectedTotal) {
    issues.push({
      file: 'BKMVDATA.TXT',
      line: dataRecords.length,
      code: 'Z900',
      message: `Z900 total is ${closingTotal}; expected ${expectedTotal}`,
    });
  }

  const a000 = iniRecords[0]?.startsWith('A000')
    ? extractFields(iniRecords[0], 'A000')
    : undefined;
  const a100 = dataRecords[0]?.startsWith('A100')
    ? extractFields(dataRecords[0], 'A100')
    : undefined;
  const z900 = closing?.startsWith('Z900')
    ? extractFields(closing, 'Z900')
    : undefined;
  const businessNumber = a000?.f_1003;
  const uniqueId = a000?.f_1004;

  if (businessNumber && !isPlaceholder(businessNumber)) {
    dataRecords.forEach((record, index) => {
      if (record.length >= 22 && record.slice(13, 22) !== businessNumber) {
        issues.push({
          file: 'BKMVDATA.TXT',
          line: index + 1,
          code: record.slice(0, 4),
          message: `${record.slice(0, 4)} business number does not match A000`,
        });
      }
    });
  }
  if (uniqueId && !isPlaceholder(uniqueId)) {
    if (a100?.f_1103 !== uniqueId) {
      issues.push({ file: 'BKMVDATA.TXT', line: 1, code: 'A100', message: 'A100 unique ID does not match A000' });
    }
    if (z900?.f_1153 !== uniqueId) {
      issues.push({ file: 'BKMVDATA.TXT', line: dataRecords.length, code: 'Z900', message: 'Z900 unique ID does not match A000' });
    }
  }

  const accountKeys = new Set(dataRecords
    .filter((record) => record.startsWith('B110'))
    .map((record) => extractFields(record, 'B110').f_1403.replace(/[! ]+$/g, '')));
  dataRecords.forEach((record, index) => {
    if (!record.startsWith('B100')) return;
    const accountKey = extractFields(record, 'B100').f_1364.replace(/[! ]+$/g, '');
    if (accountKey && !accountKeys.has(accountKey)) {
      issues.push({
        file: 'BKMVDATA.TXT',
        line: index + 1,
        code: 'B100',
        message: `B100 account ${accountKey} has no matching B110 record`,
      });
    }
  });

  const counts = new Map<string, number>();
  for (const record of dataRecords) {
    const code = record.slice(0, 4);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }

  if (iniRecords.filter((record) => record.startsWith('A000')).length !== 1) {
    issues.push({ file: 'INI.TXT', code: 'A000', message: 'INI.TXT must contain exactly one A000 record' });
  }
  for (const code of ['A100', 'Z900']) {
    if ((counts.get(code) ?? 0) !== 1) {
      issues.push({
        file: 'BKMVDATA.TXT',
        code,
        message: `BKMVDATA.TXT must contain exactly one ${code} record`,
      });
    }
  }

  const requiredSummaryCodes = ['B100', 'B110', 'C100', 'D110', 'D120', 'M100'];
  for (const code of requiredSummaryCodes) {
    const matching = iniRecords.slice(1).filter((record) => record.startsWith(code));
    if (matching.length !== 1) {
      issues.push({ file: 'INI.TXT', code, message: `INI.TXT must contain exactly one ${code} summary` });
    }
  }
  for (const [index, summary] of iniRecords.slice(1).entries()) {
    const code = summary.slice(0, 4);
    const reported = Number(summary.slice(4, 19));
    const actual = counts.get(code) ?? 0;
    if (reported !== actual) {
      issues.push({
        file: 'INI.TXT',
        line: index + 2,
        code,
        message: `INI summary ${code} is ${reported}; expected ${actual}`,
      });
    }
  }

  return issues;
}

export function assertValidUniformFileContents(iniContent: string, bkmvdataContent: string): void {
  const issues = validateUniformFileContents(iniContent, bkmvdataContent);
  if (issues.length > 0) throw new UniformFileValidationError(issues);
}
