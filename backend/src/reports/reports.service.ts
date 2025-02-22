import { HttpException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { Expense } from '../expenses/expenses.entity';
import { VatReportDto } from './dtos/vat-report.dto';
import { ExpensePnlDto, PnLReportDto } from './dtos/pnl-report.dto';
import { VatReportRequestDto } from './dtos/vat-report-request.dto';
import { ReductionReportRequestDto } from './dtos/reduction-report-request.dto';
import { DepreciationReportDto } from './dtos/reduction-report.dto';
import { ExpensesService } from '../expenses/expenses.service';
import { VAT_RATE_2023 } from '../constants';
import { SharedService } from 'src/shared/shared.service';
import { User } from '../users/user.entity';
import { BusinessType, DocumentType, DocumentTypeCodeMap} from 'src/enum';
import { TransactionsService } from 'src/transactions/transactions.service';
import { Documents } from 'src/documents/documents.entity';
import { DocLines } from 'src/documents/doc-lines.entity';
import { Transactions } from 'src/transactions/transactions.entity';
import axios from 'axios';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as archiver from 'archiver';
import * as stream from 'stream';


@Injectable()
export class ReportsService {

  private recordCounter = 1;

  constructor(
    @InjectRepository(Expense)
    private expenseRepo: Repository<Expense>,
    @InjectRepository(Transactions)
    private transactionsRepo: Repository<Transactions>,
    @InjectRepository(Documents)
    private documentsRepo: Repository<Documents>,
    @InjectRepository(DocLines)
    private docLinesRepo: Repository<DocLines>,
    @InjectRepository(User) private userRepo: Repository<User>,
    private expensesService: ExpensesService,
    private transactionsService: TransactionsService,
    private sharedService: SharedService
  ) {}


  async createPDF(data: any): Promise<Blob | undefined> {
    console.log('in createPDF function');
    
    const url = 'https://api.fillfaster.com/v1/generatePDF';
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VybmFtZSI6ImluZm9AdGF4bXlzZWxmLmNvLmlsIiwic3ViIjo5ODUsInJlYXNvbiI6IkFQSSIsImlhdCI6MTczODIzODAxMSwiaXNzIjoiaHR0cHM6Ly9maWxsZmFzdGVyLmNvbSJ9.DdKFDTxNWEXOVkEF2TJHCX0Mu2AbezUBeWOWbpYB2zM';
  
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  
    try {
      const response = await axios.post<Blob>(url, data, {
        headers: headers,
        responseType: 'arraybuffer', // ensures the response is treated as a Blob
      });
      
      return response.data;
    } 
    catch (error) {
      console.error('Error in createPDF:', error);
      throw new InternalServerErrorException("something went wrong in create PDF");
    }
  }
    

  async createVatReport(
    firebaseId: string,
      businessNumber: string,
      startDate: Date,
      endDate: Date
  ): Promise<VatReportDto> {
      
      const vatReport: VatReportDto = {
          vatableTurnover: 0,
          nonVatableTurnover: 0,
          vatRefundOnAssets: 0,
          vatRefundOnExpenses: 0,
          vatPayment: 0
      };

      const year = startDate.getFullYear();

      // Get income for vat report
      ({ vatableIncome: vatReport.vatableTurnover, noneVatableIncome: vatReport.nonVatableTurnover } =
        await this.transactionsService.getTaxableIncomefromTransactionsForVatReport(
          firebaseId,
          businessNumber,
          startDate,
          endDate
      ));
  
      // Step 1: Fetch expenses using the function we wrote based on monthReport
      const expenses = await this.expensesService.getExpensesForVatReport(firebaseId, businessNumber, startDate, endDate);        
  
      // Step 2: Filter expenses into regular (non-equipment) and assets (equipment)
      const regularExpenses = expenses.filter(expense => !expense.isEquipment);
      const assetsExpenses = expenses.filter(expense => expense.isEquipment);
  
      // Step 3: Calculate VAT for regular expenses
      const vatRegularExpensesSum = regularExpenses.reduce((sum, expense) => {
          return sum + (expense.sum * (expense.vatPercent / 100));
      }, 0);
  
      // Calculate VAT refund on expenses
      vatReport.vatRefundOnExpenses = Math.round(vatRegularExpensesSum * (1 - (1 / (1 + VAT_RATE_2023))));
  
      // Step 4: Calculate VAT for assets (equipment)
      const vatAssetsExpensesSum = assetsExpenses.reduce((sum, expense) => {
          return sum + (expense.sum * (expense.vatPercent / 100));
      }, 0);
  
      // Calculate VAT refund on assets
      vatReport.vatRefundOnAssets = Math.round(vatAssetsExpensesSum * (1 - (1 / (1 + VAT_RATE_2023))));
  
      // Step 5: Calculate VAT payment
      vatReport.vatPayment = Math.round(vatReport.vatableTurnover * this.sharedService.getVatPercent(year)) - vatReport.vatRefundOnExpenses - vatReport.vatRefundOnAssets;
  
      return vatReport;
  }


  async createPnLReport(
      firebaseId: string,
      businessNumber: string,
      startDate: Date,
      endDate: Date
  ): Promise<PnLReportDto> {

      const user = await this.userRepo.findOne({ where: { firebaseId } });
      const year = startDate.getFullYear();
      const vatPercent = this.sharedService.getVatPercent(year);

      // Get total income
      let totalIncome : number = 0;
      totalIncome = await this.transactionsService.getTaxableIncomefromTransactions(firebaseId, businessNumber, startDate, endDate);

      if (user.businessType === BusinessType.LICENSED || user.businessType === BusinessType.COMPANY) {
        totalIncome = totalIncome / (1 + vatPercent);
      }
      
      //Get expenses
      const expenses = await this.expensesService.getExpensesByDates(firebaseId, businessNumber, startDate, endDate);

      // Separate expenses into equipment and non-equipment categories
      const nonEquipmentExpenses = expenses.filter(expense => !expense.isEquipment);

      // Initialize an object to hold the totalTaxPayable sums by category
      const totalTaxPayableByCategory: { [category: string]: number } = {};

      // Loop through each non-equipment expense
      for (const expense of nonEquipmentExpenses) {
          const category = String(expense.category); // Ensure category is treated as a string
          if (!totalTaxPayableByCategory[category]) {
              totalTaxPayableByCategory[category] = 0; // Initialize category sum if not already done
          }
          totalTaxPayableByCategory[category] += Number(expense.totalTaxPayable); // Sum up the totalTaxPayable
      }

        // Map the totals by category into an array of ExpenseDto
      const expenseDtos: ExpensePnlDto[] = Object.entries(totalTaxPayableByCategory).map(
          ([category, total]) => ({
              category,
              total,
          })
      );

      const depreciationExpenses = await this.createReductionReport(firebaseId, businessNumber, year);

      if (depreciationExpenses?.length > 0) {
        // Calculate the total of currentReduction from reductionExpenses using a for loop
        let totalDepreciationExpenses = 0;
        for (const expense of depreciationExpenses) {
          if (expense.currentDepreciation) {
            totalDepreciationExpenses += Number(expense.currentDepreciation); // Ensure conversion to a number
          }
        }
      
        // Add reduction expenses as "הוצאות פחת"
        if (totalDepreciationExpenses > 0) {
          expenseDtos.push({
            category: "הוצאות פחת",
            total: totalDepreciationExpenses,
          });
        }
      }
      
      // Calculate the total expenses using a for loop
      let totalExpenses = 0;
      for (const expense of expenseDtos) {
        totalExpenses += expense.total;
      }

      // Calculate net profit before tax
      const netProfitBeforeTax = totalIncome - totalExpenses;

      // Construct the final report
      const report: PnLReportDto = {
          income: Number(totalIncome.toFixed(2)),
          expenses: expenseDtos,
          netProfitBeforeTax:Number(netProfitBeforeTax.toFixed(2)),
      };
      
      return report;
      
  }
        

  async createReductionReport(firebaseId: string, businessNumber: string, year: number): Promise<DepreciationReportDto[]> {

      const equipmentExpenses = await this.expensesService.getExpensesForReductionReport(firebaseId, businessNumber, year);
      return this.calculateReductionsForExpenses(equipmentExpenses, year)

  }

    
  calculateReductionsForExpenses(
      expenses: Expense[],
      requiredYear: number
    ): DepreciationReportDto[] {

      // Use map to transform each expense into a ReductionReportDto
      return expenses.map((expense) => {
        const { supplier: name, date, sum, reductionPercent } = expense;
        let pastDepreciation = 0;
        let currentDepreciation = 0;
        let fixedReductionPercent;
        const validDate = typeof date === 'string' ? new Date(date) : date;

        // In case the reductionPercent from the user is not arrived accuratelly (for example 33 instead of 33.33), fix it to get accurate results. 
        if (reductionPercent === 33) {
          fixedReductionPercent = (100/3);
        } else {
          fixedReductionPercent = reductionPercent;
        }
    
        // Calculate total reduction years for the expense
        const totalReductionYears = this.calculateReductionYears(fixedReductionPercent, validDate);
        const firstYear = validDate.getFullYear();
        const lastYear = firstYear + totalReductionYears - 1;
    
        // Iterate through the years from the purchase year to the required year
        for (let year = firstYear; year <= requiredYear; year++) {
          const yearFraction = this.calculateYearlyReductionFraction(year, validDate, fixedReductionPercent, totalReductionYears);            
          const yearReduction = Math.round((yearFraction / 100) * sum);
    
          if (year < requiredYear) {
            // Accumulate reduction for past years
            pastDepreciation += yearReduction;
          } else if (year === requiredYear) {
            if (year === lastYear) {
              currentDepreciation = sum - pastDepreciation;
            } else {
              // Add reduction for the required year
              currentDepreciation = yearReduction;
            }
          }
        }
    
        // Create and return a DTO matching ReductionReportDto
        return {
          name,
          date: validDate,
          depreciationPercent: reductionPercent.toFixed(2), // Convert reduction percent to string
          currentDepreciation: Math.min(currentDepreciation, sum - pastDepreciation), // Prevent over-reduction
          pastDepreciation: Math.min(pastDepreciation, sum), // Ensure reduction doesn't exceed the total sum

        } as DepreciationReportDto; // Explicitly cast to ReductionReportDto
      });
  }
    
    
  calculateReductionYears(reductionPercent: number, date: Date): number {
    
    const purchaseMonth = date.getMonth() + 1; 
    const isPartialYear = purchaseMonth > 1 || date.getDate() > 1;
  
    const fullYears = Math.round(100 / reductionPercent);
    const totalYears = fullYears + (isPartialYear ? 1 : 0);
  
    return totalYears;
  }


  calculateYearlyReductionFraction(
      year: number,
      date: Date,
      reductionPercent: number,
      totalReductionYears: number
    ): number {

      let result: number = 0;
      const purchaseYear = date.getFullYear();
    
      // If the given year is before the purchase year or after the total reduction period
      if (year < purchaseYear || year > purchaseYear + totalReductionYears - 1) {
        result = 0;
      }
    
      const isLeap = this.isLeapYear(year);
      const daysInYear = isLeap ? 366 : 365;
    
      // First year: calculate partial reduction based on days remaining in the year
      if (year === purchaseYear) {
          const daysRemaining =
          Math.ceil(
            (new Date(purchaseYear, 11, 31).getTime() - date.getTime()) /
              (1000 * 60 * 60 * 24)
          ) + 1; // Days from the purchase date to the end of the year, including the purchase day
          result = (reductionPercent * daysRemaining) / daysInYear;
      // Last year: calculate partial reduction based on days used in that year
      } else if (year === purchaseYear + totalReductionYears - 1) {
          const firstDayOfYear = new Date(year, 0, 1); // January 1st of the last reduction year
          const daysUsed =
          Math.ceil(
            (new Date(year, 11, 31).getTime() - firstDayOfYear.getTime()) /
              (1000 * 60 * 60 * 24)
          ) + 1; // Total days of the year that apply for reduction
          return (reductionPercent * daysUsed) / daysInYear;
      // Full years: apply the full reduction percentage
      } else {
        result = reductionPercent;
      }
      
      return result;
    }
    
    // Helper function to determine if a year is a leap year
    isLeapYear(year: number): boolean {
      return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    }
    

    async createUniformFile(userId: string, startDate: string, endDate: string, businessNumber: string): Promise<{ fileName: string; zipBuffer: Buffer }> {

      const zipFileName = `openformat.zip`;

      // Generate Unique Random Number (15 digits)
      const uniqueId = this.generateUniqueId();

      // Trim businessNumber to 8 digits if it has 9
      if (businessNumber.length === 9) {
        businessNumber = businessNumber.substring(0, 8);
      }

      // Get current year suffix (XX)
      const currentYear = new Date().getFullYear();
      const XX = String(currentYear).slice(-2); // 2025 → "25"

      // Create folder names
      const businessFolder = `${businessNumber}.${XX}`;
      const MMDDhhmm = this.getCurrentTimestamp();

      // Generate file contents
      const iniContent = this.generateIniFileContent(businessNumber, currentYear, businessFolder, MMDDhhmm, uniqueId);
      const dataContent = await this.generateDataFileContent(userId, businessNumber, startDate, endDate, uniqueId);

      return new Promise((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks: Buffer[] = [];

        archive.append(Buffer.from(iniContent, 'utf-8'), { name: `OPENFORMAT/${businessFolder}/${MMDDhhmm}/INI.TXT` });
        archive.append(Buffer.from(dataContent, 'utf-8'), { name: `OPENFORMAT/${businessFolder}/${MMDDhhmm}/BKMVDATA.TXT` });

        // Finalize ZIP file
        archive.finalize();

        archive.on('data', (chunk) => chunks.push(chunk));
        archive.on('end', () => {
          const zipBuffer = Buffer.concat(chunks);
          console.log(`ZIP file created with unique ID: ${uniqueId}`);
          resolve({ fileName: zipFileName, zipBuffer });
        });

        archive.on('error', (err) => reject(err));
      });
    }


    // Function to generate INI.TXT content
    private generateIniFileContent(businessNumber: string, currentYear: number, businessFolder: string, MMDDhhmm: string, uniqueId: string): string {
      return `A000 | 1.31 | 000000000 | ${businessNumber} | ${currentYear} | ${businessFolder}\\${MMDDhhmm} | ${this.getCurrentDate()} | ${this.getCurrentTime()} | ${uniqueId}`;
    }


    // Function to generate a 15-digit unique random number
    private generateUniqueId(): string {
      return Math.floor(100000000000000 + Math.random() * 900000000000000).toString();
    }


    // Function to get current date in YYYYMMDD format
    private getCurrentDate(): string {
      const now = new Date();
      return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    }


    // Function to get current time in HHMM format
    private getCurrentTime(): string {
      const now = new Date();
      return `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    }


    // Function to get current timestamp for folder naming (MMDDhhmm)
    private getCurrentTimestamp(): string {
      const now = new Date();
      return `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    }


    private async generateDataFileContent(userId: string, businessNumber: string, startDate: string, endDate: string, uniqueId: string): Promise<string> {

      let content = "";

      const documents = await this.fetchDocuments(userId, businessNumber, startDate, endDate);
    
      // Add A100 section first
      content += this.generateA100Section(businessNumber, uniqueId);

      // Add C100 section
      content += this.generateC100Section(businessNumber, documents);

      // Add D110 section
      content += this.generateD110Section(documents);

      // Add D120 section
      content += this.generateD120Section(documents);

      // Add B100 section
      content += this.generateB100Section(documents);

      // Add B110 section
      content += this.generateB110Section(documents);

      // Add Z900 section first
      content += this.generateZ900Section(businessNumber, uniqueId);
    
      return content;

    }


    private generateA100Section(businessNumber: string, uniqueId: string): string {
      return `A100 | ${this.getFormattedRecordCounter()} | ${businessNumber} | ${uniqueId} | &OF1.31& | ${'?'.repeat(50)}\n`;
    }


    private async generateC100Section(businessNumber: string, documents: Documents[]): Promise<string> {
      let result = '';
      documents.forEach((doc) => {
        const f_1201 = this.getFormattedRecordCounter();
        const f_1202 = this.formatField(doc.issuerbusinessNumber, 9, '0');
        const f_1203 = this.formatField(this.getDocumentTypeCode(doc.docType), 3, '0');
        const f_1204 = this.formatField(doc.docNumber, 20, '0');
        const f_1205 = this.formatField(this.formatDateYYYYMMDD(doc.issueDate), 8, '0');
        const f_1206 = this.formatField(doc.issueHour, 4, '0');
        const f_1207 = this.formatField(doc.recipientName, 50, '!');
        const f_1208 = this.formatField(doc.recipientStreet, 50, '!');
        const f_1209 = this.formatField(doc.recipientHomeNumber, 10, '!');
        const f_1210 = this.formatField(doc.recipientCity, 30, '!');
        const f_1211 = this.formatField(doc.recipientPostalCode, 8, '0');
        const f_1212 = this.formatField(doc.recipientState, 30, '!');
        const f_1213 = this.formatField(doc.recipientStateCode, 2, '!');
        const f_1214 = this.formatField(doc.recipientPhone, 15, '!');
        const f_1215 = this.formatField(doc.recipientId, 9, '0');
        const f_1216 = this.formatField(doc.valueDate, 8, '!'); // תאריך ערך - לבדוק עם שריה
        const f_1217 = this.formatAmount(doc.amountForeign, 12, 2); // ימולא רק בחשבונית ייצוא - לבדוק עם שריה
        const f_1218 = this.formatField(doc.currency, 3, '!');
        const f_1219 = this.formatAmount(doc.sumBefDisBefVat, 12, 2);
        const f_1220 = this.formatAmount(doc.disSum, 12, 2);
        const f_1221 = this.formatAmount(doc.sumAftDisBefVAT, 12, 2);
        const f_1222 = this.formatAmount(doc.vatSum, 12, 2);
        const f_1223 = this.formatAmount(doc.sumAftDisWithVAT, 12, 2);
        const f_1224 = this.formatAmount(doc.withholdingTaxAmount, 9, 2);
        const f_1225 = this.formatField(doc.customerKey, 15, '!'); // מפתח לקוח - לבדוק עם שריה
        const f_1226 = this.formatField(doc.matchField, 10, '!'); // שדה התאמה - לבדוק עם שריה
        const f_1228 = this.formatField(doc.isCancelled ? '1' : '0', 1); // שדה התאמה - לבדוק עם שריה
        const f_1230 = this.formatField(this.formatDateYYYYMMDD(doc.docDate), 8, '0');
        const f_1231 = this.formatField(doc.branchCode, 7, '!');
        const f_1233 = this.formatField(doc.operationPerformer, 9, '!');
        const f_1234 = this.formatField(doc.generalDocIndex, 7, '!');
        const f_1235 = this.formatField("!", 13, '!');
    
        result += `C100 | ${f_1201} | ${f_1202} | ${f_1203} | ${f_1204} | ${f_1205} | ${f_1206} | ${f_1207} | ${f_1208} | ${f_1209} | ${f_1210} | 
                          ${f_1211} | ${f_1212} | ${f_1213} | ${f_1214} | ${f_1215} | ${f_1216} | ${f_1217} | ${f_1218} | ${f_1219} | ${f_1220} | 
                          ${f_1221} | ${f_1222} | ${f_1223} | ${f_1224} | ${f_1225} | ${f_1226} | ${f_1228} | ${f_1230} | ${f_1231} | ${f_1233} | 
                          ${f_1234} | ${f_1235}\n`;
      });
    
      return result;
    }


    private async generateD110Section(documents: Documents[]): Promise<string> {

      let result = '';
    
      for (const doc of documents) {

        // Fetch all matching lines for the current document
        const docLines = await this.docLinesRepo.find({
          where: {
            issuerbusinessNumber: doc.issuerbusinessNumber,
            generalDocIndex: doc.generalDocIndex,
          },
        });
    
        docLines.forEach((line) => {
          const f_1251 = this.getFormattedRecordCounter();
          const f_1252 = this.formatField(doc.issuerbusinessNumber, 9, '0');
          const f_1253 = this.formatField(this.getDocumentTypeCode(doc.docType), 3, '0');
          const f_1254 = this.formatField(doc.docNumber, 20, '0');
          const f_1255 = this.formatField(line.lineNumber, 4, '0');
          const f_1256 = this.formatField(this.getDocumentTypeCode(doc.parentDocType), 3, '0');
          const f_1257 = this.formatField(doc.parentDocNumber, 20, '0');
          const f_1258 = this.formatField(doc.transType, 1, '0');
          const f_1259 = this.formatField(line.internalNumber, 20, '0');
          const f_1260 = this.formatField(line.description, 30, '!');
          const f_1261 = this.formatField(line.manufacturerName, 50, '!');
          const f_1262 = this.formatField(line.productSerialNumber, 30, '!');
          const f_1263 = this.formatField(line.unitType, 20, '!');
          const f_1264 = this.formatAmount(line.unitAmount, 12, 4);
          const f_1265 = this.formatAmount(line.sumBefVat/line.unitAmount, 12, 2);
          const f_1266 = this.formatAmount(line.discount, 12, 2);
          const f_1267 = this.formatAmount(line.sumBefVat, 12, 2);
          const f_1268 = this.formatAmount(line.vatRate, 2, 2);
          const f_1270 = this.formatField(doc.branchCode, 7, '0');
          const f_1272 = this.formatField(this.formatDateYYYYMMDD(doc.docDate), 8, '0');
          const f_1273 = this.formatField(line.generalDocIndex, 7, '0');
          const f_1274 = this.formatField(doc.parentBranchCode, 7, '0');
          const f_1275 = this.formatField("!", 13, '!');

          result += `D100 | ${f_1251} | ${f_1252} | ${f_1253} | ${f_1254} | ${f_1255} | ${f_1256} | ${f_1257} 
                          | ${f_1258} | ${f_1259} | ${f_1260} | ${f_1261} | ${f_1262} | ${f_1263} | ${f_1264} 
                          | ${f_1265} | ${f_1266} | ${f_1267} | ${f_1268} | ${f_1270} | ${f_1272} | ${f_1273}
                          | ${f_1274} | ${f_1275}\n`;
        });
      }
    
      return result;
    }


    private async generateD120Section(documents: Documents[]): Promise<string> {

      let result = '';
    
      for (const doc of documents) {

        // Fetch all matching lines for the current document
        const docLines = await this.docLinesRepo.find({
          where: {
            issuerbusinessNumber: doc.issuerbusinessNumber,
            generalDocIndex: doc.generalDocIndex,
          },
        });
    
        // Loop through the lines and create D100 records
        docLines.forEach((line) => {
          const f_1301 = this.getFormattedRecordCounter(); // Running counter (9 digits)
          const f_1302 = this.formatField(doc.issuerbusinessNumber, 9, '0');
          const f_1303 = this.formatField(this.getDocumentTypeCode(doc.docType), 3, '0');
          const f_1304 = this.formatField(doc.docNumber, 20, '0');
          const f_1305 = this.formatField(line.lineNumber, 4, '0');
          const f_1306 = this.formatField(line.paymentMethod, 1, '0');
          const f_1307 = this.formatField(line.bankNumber, 10, '0');
          const f_1308 = this.formatField(line.branchNumber, 10, '0');
          const f_1309 = this.formatField(line.accountNumber, 15, '0');
          const f_1310 = this.formatField(line.checkNumber, 10, '0');
          const f_1311 = this.formatField(this.formatDateYYYYMMDD(line.paymentCheckDate), 8, '0');;
          const f_1312 = this.formatAmount(line.sumBefVat, 12, 2);
          const f_1313 = this.formatField(line.cardCompany, 1, '0');
          const f_1314 = this.formatField(line.card4Number, 20, '0');
          const f_1315 = this.formatField(line.creditTransType, 1, '0');
          const f_1320 = this.formatField(doc.branchCode, 7, '0');
          const f_1322 = this.formatField(this.formatDateYYYYMMDD(doc.docDate), 8, '0');
          const f_1323 = this.formatField(line.generalDocIndex, 7, '0');
          const f_1324 = this.formatField("!", 60, '!');

          result += `D120 | ${f_1301} | ${f_1302} | ${f_1303} | ${f_1304} | ${f_1305} | ${f_1306} | ${f_1307} 
                          | ${f_1308} | ${f_1309} | ${f_1310} | ${f_1311} | ${f_1312} | ${f_1313} | ${f_1314} 
                          | ${f_1315} | ${f_1320} | ${f_1322} | ${f_1323} | ${f_1324}\n`;
        });
      }
    
      return result;
    }


    private async generateB100Section(documents: Documents[]): Promise<string> {

      let result = '';
    
      for (const doc of documents) {

        // Fetch all matching lines for the current document
        const docLines = await this.docLinesRepo.find({
          where: {
            issuerbusinessNumber: doc.issuerbusinessNumber,
            generalDocIndex: doc.generalDocIndex,
          },
        });
    
        docLines.forEach((line) => {
          const f_1351 = this.getFormattedRecordCounter();
          const f_1352 = this.formatField(doc.issuerbusinessNumber, 9, '0');
          const f_1353 = this.formatField("!", 10, '!');
          const f_1354 = this.formatField("!", 5, '!');
          const f_1355 = this.formatField("!", 8, '!');
          const f_1356 = this.formatField("!", 15, '!');
          const f_1357 = this.formatField("!", 20, '!');
          const f_1358 = this.formatField("!", 3, '!');
          const f_1359 = this.formatField("!", 20, '!');
          const f_1360 = this.formatField("!", 3, '!');
          const f_1361 = this.formatField("!", 50, '!');
          const f_1362 = this.formatField("!", 8, '!');
          const f_1363 = this.formatField("!", 8, '!');
          const f_1364 = this.formatField("!", 15, '!');
          const f_1365 = this.formatField("!", 15, '!');
          const f_1367 = this.formatField("!", 1, '!');
          const f_1366 = this.formatField("!", 3, '!');
          const f_1368 = this.formatField("!", 15, '!');
          const f_1369 = this.formatField("!", 15, '!');
          const f_1370 = this.formatField("!", 12, '!');
          const f_1371 = this.formatField("!", 10, '!');
          const f_1372 = this.formatField("!", 10, '!');
          const f_1374 = this.formatField("!", 7, '!');
          const f_1375 = this.formatField("!", 8, '!');
          const f_1376 = this.formatField("!", 9, '!');
          const f_1377 = this.formatField("!", 25, '!');

          result += `B100 | ${f_1351} | ${f_1352} | ${f_1353} | ${f_1354} | ${f_1355} | ${f_1356} | ${f_1357} 
                          | ${f_1358} | ${f_1359} | ${f_1360} | ${f_1361} | ${f_1362} | ${f_1363} | ${f_1364} 
                          | ${f_1365} | ${f_1366} | ${f_1367} | ${f_1368} | ${f_1369} | ${f_1370} | ${f_1371}
                          | ${f_1372} | ${f_1374} | ${f_1375} | ${f_1376} | ${f_1377}\n`;
        });
      }
    
      return result;
    }


    private async generateB110Section(documents: Documents[]): Promise<string> {

      let result = '';
    
      for (const doc of documents) {

        // Fetch all matching lines for the current document
        const docLines = await this.docLinesRepo.find({
          where: {
            issuerbusinessNumber: doc.issuerbusinessNumber,
            generalDocIndex: doc.generalDocIndex,
          },
        });
    
        docLines.forEach((line) => {
          const f_1401 = this.getFormattedRecordCounter();
          const f_1402 = this.formatField(doc.issuerbusinessNumber, 9, '0');
          const f_1403 = this.formatField("!", 15, '!');
          const f_1404 = this.formatField("!", 50, '!');
          const f_1405 = this.formatField("!", 15, '!');
          const f_1406 = this.formatField("!", 30, '!');
          const f_1407 = this.formatField("!", 50, '!');
          const f_1408 = this.formatField("!", 10, '!');
          const f_1409 = this.formatField("!", 30, '!');
          const f_1410 = this.formatField("!", 8, '!');
          const f_1411 = this.formatField("!", 30, '!');
          const f_1412 = this.formatField("!", 2, '!');
          const f_1413 = this.formatField("!", 15, '!');
          const f_1414 = this.formatField("!", 15, '!');
          const f_1415 = this.formatField("!", 15, '!');
          const f_1416 = this.formatField("!", 15, '!');
          const f_1417 = this.formatField("!", 4, '!');
          const f_1419 = this.formatField("!", 9, '!');
          const f_1421 = this.formatField("!", 7, '!');
          const f_1422 = this.formatField("!", 15, '!');
          const f_1423 = this.formatField("!", 3, '!');
          const f_1424 = this.formatField("!", 16, '!');

          result += `B110 | ${f_1401} | ${f_1402} | ${f_1403} | ${f_1404} | ${f_1405} | ${f_1406} | ${f_1407} 
                          | ${f_1408} | ${f_1409} | ${f_1410} | ${f_1411} | ${f_1412} | ${f_1413} | ${f_1414} 
                          | ${f_1415} | ${f_1416} | ${f_1417} | ${f_1419} | ${f_1421} | ${f_1422} | ${f_1423}
                          | ${f_1424}\n`;
        });
      }
    
      return result;
    }


    private async generateM100Section(documents: Documents[]): Promise<string> {

      let result = '';
    
      for (const doc of documents) {

        // Fetch all matching lines for the current document
        const docLines = await this.docLinesRepo.find({
          where: {
            issuerbusinessNumber: doc.issuerbusinessNumber,
            generalDocIndex: doc.generalDocIndex,
          },
        });
    
        docLines.forEach((line) => {
          const f_1451 = this.getFormattedRecordCounter();
          const f_1452 = this.formatField(doc.issuerbusinessNumber, 9, '0');
          const f_1453 = this.formatField("!", 20, '!');
          const f_1454 = this.formatField("!", 20, '!');
          const f_1455 = this.formatField("!", 20, '!');
          const f_1456 = this.formatField("!", 50, '!');
          const f_1457 = this.formatField("!", 10, '!');
          const f_1458 = this.formatField("!", 30, '!');
          const f_1459 = this.formatField("!", 20, '!');
          const f_1460 = this.formatField("!", 12, '!');
          const f_1461 = this.formatField("!", 12, '!');
          const f_1462 = this.formatField("!", 12, '!');
          const f_1463 = this.formatField("!", 10, '!');
          const f_1464 = this.formatField("!", 10, '!');
          const f_1465 = this.formatField("!", 50, '!');

          result += `M100 | ${f_1451} | ${f_1452} | ${f_1453} | ${f_1454} | ${f_1455} | ${f_1456} | ${f_1457} 
                          | ${f_1458} | ${f_1459} | ${f_1460} | ${f_1461} | ${f_1462} | ${f_1463} | ${f_1464} 
                          | ${f_1465}\n`;
        });
      }
    
      return result;
    }
    

    private generateZ900Section(businessNumber: string, uniqueId: string): string {
      return `Z900 | ${this.getFormattedRecordCounter()} | ${businessNumber} | ${uniqueId} | &OF1.31& | "TODO: add number of all lists" | ${'?'.repeat(50)}\n`;
    }


    // Format a field to a fixed length
    private formatField(value: string | number | Date, length: number, padChar: string = ' ', alignLeft: boolean = false): string {
      let strValue: string;
  
      // Convert Date to YYYYMMDD format before processing
      if (value instanceof Date) {
          strValue = this.formatDateYYYYMMDD(value);
      } else {
          strValue = value.toString();
      }
  
      // Truncate if too long
      if (strValue.length > length) {
          return strValue.substring(0, length);
      }
  
      // Pad the value (left or right)
      return alignLeft ? strValue.padEnd(length, padChar) : strValue.padStart(length, padChar);
    }
  

    // Function to format the global recordCounter as 9 digits
    private getFormattedRecordCounter(): string {
      return String(this.recordCounter++).padStart(9, '0');
    }


    private formatAmount(value: number, totalLength: number, decimalPlaces: number): string {
      const sign = value < 0 ? '-' : '+'; // Add "+" for positive and "-" for negative
      let formattedValue = Math.abs(value)
          .toFixed(decimalPlaces) // Convert to string with 2 decimal places
          .replace('.', '') // Remove decimal point
          .padStart(totalLength - 1, '0'); // Pad to ensure correct length (excluding sign)
  
      return sign + formattedValue; // Prefix the sign
    }
  

    private getDocumentTypeCode(documentType: DocumentType): number {
      if (!(documentType in DocumentTypeCodeMap)) {
        throw new Error(`Invalid document type: ${documentType}`);
      }
      return DocumentTypeCodeMap[documentType];
    }


    // Format date to YYYYMMDD
    private formatDateYYYYMMDD(date: Date): string {
      return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    }


    // Fetch documents by userId, businessNumber, startDate, and endDate
    async fetchDocuments(userId: string, businessNumber: string, startDate: string, endDate: string): Promise<Documents[]> {
      return this.documentsRepo.find({
        where: {
          issuerbusinessNumber: businessNumber, // Only fetch documents issued by this business
          docDate: Between(new Date(startDate), new Date(endDate)),
        },
        order: { docDate: 'ASC' },
      });
    }

    
}