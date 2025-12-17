import { BadRequestException, Injectable, InternalServerErrorException, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Not, Repository } from 'typeorm';
import { Expense } from '../expenses/expenses.entity';
import { VatReportDto } from './dtos/vat-report.dto';
import { ExpensePnlDto, PnLReportDto } from './dtos/pnl-report.dto';
import { DepreciationReportDto } from './dtos/reduction-report.dto';
import { ExpensesService } from '../expenses/expenses.service';
import { SharedService } from 'src/shared/shared.service';
import { User } from '../users/user.entity';
import { BusinessType, DOC_TYPE_INFO, DocumentSummaryRow, DocumentType, FIELD_MAP, JournalReferenceType, ListSummaryRow, PaymentMethodType, UniformFileTypeCodeMap, UniformSummaries} from 'src/enum';
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
import * as readline from 'readline';
import * as iconv from 'iconv-lite';
import { JournalEntry } from 'src/bookkeeping/jouranl-entry.entity';
import { JournalLine } from 'src/bookkeeping/jouranl-line.entity';
import { DefaultBookingAccount } from 'src/bookkeeping/account.entity';
import { DocPayments } from 'src/documents/doc-payments.entity';
import { Business } from 'src/business/business.entity';


@Injectable()
export class ReportsService {

  private recordCounter = 1;
  private readonly logger = new Logger(ReportsService.name);  // Log service name
  private readonly generatedFolder = "src/generated/";  // Define folder for uploads
  private readonly debugFolder = "src/debug/";  // Define folder for debug files

  private recordSummary = { A100: 1, B100: 0, B110: 0, C100: 0, D110: 0, D120: 0, M100: 0, Z900: 1 };
  private totalLists = 0;

  constructor(
    private expensesService: ExpensesService,
    private transactionsService: TransactionsService,
    private sharedService: SharedService,
    @InjectRepository(Expense)
    private expenseRepo: Repository<Expense>,
    @InjectRepository(Transactions)
    private transactionsRepo: Repository<Transactions>,
    @InjectRepository(Business)
    private businessRepo: Repository<Business>,
    @InjectRepository(Documents)
    private documentsRepo: Repository<Documents>,
    @InjectRepository(DocLines)
    private docLinesRepo: Repository<DocLines>,
    @InjectRepository(DocPayments)
    private docPaymentsRepo: Repository<DocPayments>,
    @InjectRepository(User) 
    private userRepo: Repository<User>,
    @InjectRepository(JournalEntry) 
    private JournalEntryRepo: Repository<JournalEntry>,
    @InjectRepository(JournalLine) 
    private JournalLineRepo: Repository<JournalLine>,
    @InjectRepository(DefaultBookingAccount) 
    private defaultBookingAccountRepo: Repository<DefaultBookingAccount>,
  ) {
    if (!fs.existsSync(this.debugFolder)) {
      fs.mkdirSync(this.debugFolder, { recursive: true });
    }
  }


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
          vatPayment: 0,
          vatRate: 0
      };

      const year = startDate.getFullYear();

      // Get income for vat report
      // ({ vatableIncome: vatReport.vatableTurnover, noneVatableIncome: vatReport.nonVatableTurnover } =
      //   await this.transactionsService.getTaxableIncomefromTransactionsForVatReport(
      //     firebaseId,
      //     businessNumber,
      //     startDate,
      //     endDate
      // ));

      ({ vatableIncome: vatReport.vatableTurnover, nonVatableIncome: vatReport.nonVatableTurnover } =
        await this.getVatIncomeFromLines(
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
      vatReport.vatRefundOnExpenses = regularExpenses.reduce((sum, expense) => sum + Number(expense.totalVatPayable || 0), 0);
      
      // Step 4: Calculate VAT for assets (equipment)
      vatReport.vatRefundOnAssets = assetsExpenses.reduce((sum, expense) => sum + Number(expense.totalVatPayable || 0), 0);

      // Step 5: Calculate VAT payment
      vatReport.vatPayment = Math.round(vatReport.vatableTurnover * this.sharedService.getVatPercent(year)) - vatReport.vatRefundOnExpenses - vatReport.vatRefundOnAssets;

      vatReport.vatRate = this.sharedService.getVatRateByYear(startDate);
  
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

      const business = await this.businessRepo.findOne({
        where: { businessNumber, firebaseId }
      });

      if (!business) {
        throw new BadRequestException("Business not found or not owned by user");
      }

      // Get total income
      let totalIncome : number = 0;
      totalIncome = await this.getIncomeBeforeVat(businessNumber, startDate, endDate);

      console.log("totalIncome is ", totalIncome);
      
      // if ([BusinessType.LICENSED, BusinessType.COMPANY].includes(business.businessType)) {
      //   totalIncome = totalIncome / (1 + vatPercent);
      // }
      
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



  async getVatIncomeFromLines(
  businessNumber: string,
  startDate: Date,
  endDate: Date,
): Promise<{
  vatableIncome: number;
  nonVatableIncome: number;
}> {

  const qb = this.docLinesRepo
    .createQueryBuilder('dl')
    .innerJoin(Documents, 'd', 'dl.generalDocIndex = d.generalDocIndex')
    .where('dl.issuerBusinessNumber = :businessNumber', { businessNumber })
    .andWhere('d.isCancelled = false')
    .andWhere('d.docDate BETWEEN :start AND :end', {
      start: startDate,
      end: endDate,
    });

  // 1️⃣ VATABLE Income (vatRate > 0) AND only taxable doc types
  const vatable = await qb
    .clone()
    .andWhere('dl.vatRate > 0')
    .andWhere('dl.docType IN (:...types)', {
      types: ['TAX_INVOICE', 'TAX_INVOICE_RECEIPT', 'CREDIT_INVOICE'],
    })
    .select(`
    COALESCE(SUM(
      CASE 
        WHEN dl.docType = 'CREDIT_INVOICE' 
        THEN -dl.sumAftDisBefVatPerLine 
        ELSE dl.sumAftDisBefVatPerLine 
      END
    ), 0)
    `, 'total')
    .getRawOne<{ total: string }>();

    // .select('COALESCE(SUM(dl.sumAftDisBefVatPerLine), 0)', 'total')
    // .getRawOne<{ total: string }>();

  // 2️⃣ NON-VATABLE Income (vatRate = 0)
  // includes RECEIPT with 0 VAT (e.g., grants)
  const nonVatable = await qb
    .clone()
    .andWhere('dl.vatRate = 0')
    .select('COALESCE(SUM(dl.sumAftDisBefVatPerLine), 0)', 'total')
    .getRawOne<{ total: string }>();

  return {
    vatableIncome: Number(vatable.total),
    nonVatableIncome: Number(nonVatable.total),
  };
}



  async getIncomeBeforeVat(
    businessNumber: string,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {

    // 1️⃣ Get the business and its type

    console.log("businessNumber is ", businessNumber);
    
    const business = await this.businessRepo.findOne({
      where: { businessNumber },
    });

    if (!business) {
      throw new NotFoundException('Business not found');
    }

    // 2️⃣ Filter by business type
    const { businessType } = business;

    // Base condition for all businesses
    const baseQb = this.documentsRepo
      .createQueryBuilder('doc')
      .where('doc.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('doc.isCancelled = false');

    // 3️⃣ Logic by type
    if (businessType === BusinessType.EXEMPT) {
      // 🟢 Exempt (עוסק פטור)
      // Income is based on RECEIPTs (sumAftDisBefVAT)
      const result = await baseQb
        .andWhere('doc.docType = :type', { type: 'RECEIPT' })
        .andWhere('doc.valueDate BETWEEN :start AND :end', {
          start: startDate,
          end: endDate,
        })
        .select('COALESCE(SUM(doc.sumAftDisBefVAT), 0)', 'total')
        .getRawOne<{ total: string }>();

      return Number(result.total);
    }

    // 🟣 Licensed / Company (עוסק מורשה / חברה)
    // Income before VAT = (TAX_INVOICE + TAX_INVOICE_RECEIPT) - CREDIT_INVOICE
    const regularInvoices = await baseQb
      .andWhere('doc.docType IN (:...types)', {
        types: ['TAX_INVOICE', 'TAX_INVOICE_RECEIPT'],
      })
      .andWhere('doc.docDate BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      })
      .select('COALESCE(SUM(doc.sumAftDisBefVAT), 0)', 'total')
      .getRawOne<{ total: string }>();

    const creditInvoices = await this.documentsRepo
      .createQueryBuilder('doc')
      .where('doc.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('doc.isCancelled = false')
      .andWhere('doc.docType = :type', { type: 'CREDIT_INVOICE' })
      .andWhere('doc.docDate BETWEEN :start AND :end', {
        start: startDate,
        end: endDate,
      })
      .select('COALESCE(SUM(doc.sumAftDisBefVAT), 0)', 'total')
      .getRawOne<{ total: string }>();

    const totalIncome =
      Number(regularInvoices.total) - Number(creditInvoices.total);

    return totalIncome;
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
    

    async createUniformFile(userId: string, startDate: string, endDate: string, businessNumber: string): Promise<{ filePath: string; zipBuffer: Buffer; document_summary: DocumentSummaryRow[]; list_summary: ListSummaryRow[] }> {

      // Generate Unique Random Number (15 digits)
      const uniqueId = this.generateUniqueId();
      
      const { content: dataContent, summary } = await this.generateDataFileContent(userId, businessNumber, startDate, endDate, uniqueId);

      // const zipFileName = `openformat.zip`;

      // Trim businessNumber to 8 digits if it has 9
      let trimBusinessNumber = businessNumber;
      if (businessNumber.length === 9) {
        trimBusinessNumber = businessNumber.substring(0, 8);
      }

      // Get current year suffix (XX)
      const currentYear = new Date().getFullYear();
      const XX = String(currentYear).slice(-2);

      // Create folder names
      const businessFolder = `${trimBusinessNumber}.${XX}`;
      const MMDDhhmm = this.getCurrentTimestamp();
      const filePath = `${businessFolder}/${MMDDhhmm}` 

      // Generate file contents
      const iniContent = await this.generateIniFileContent(businessNumber, uniqueId, filePath, startDate, endDate);

      const { document_summary, list_summary } = await this.buildUniformSummaries(businessNumber, startDate, endDate);

      return new Promise((resolve, reject) => {
        const archive = archiver('zip', { zlib: { level: 9 } });
        const chunks: Buffer[] = [];

        const iniBuffer = iconv.encode(iniContent, 'windows-1255');
        // archive.append(iniBuffer, { name: `OPENFRMT/${businessFolder}/${MMDDhhmm}/INI.TXT` });
        archive.append(iniBuffer, { name: `OPENFRMT/${filePath}/INI.TXT` });

        const dataBuffer = iconv.encode(dataContent, 'windows-1255');
        archive.append(dataBuffer, { name: `OPENFRMT/${filePath}/BKMVDATA.TXT` });        

        // Finalize ZIP file
        archive.finalize();
        archive.on('data', (chunk) => chunks.push(chunk));
        archive.on('end', () => {
          const zipBuffer = Buffer.concat(chunks);
          // resolve({ fileName: zipFileName, zipBuffer, document_summary, list_summary});
          resolve({ filePath: `OPENFRMT/${filePath}`, zipBuffer, document_summary, list_summary});
        });

        archive.on('error', (err) => reject(err));
      });
    }


    private async generateIniFileContent(businessNumber: string, uniqueId: string, filePath: string, startDate: string, endDate: string): Promise<string> {

      const currentDate = new Date();
      const formattedCurrentDate = `${currentDate.getFullYear()}${String(currentDate.getMonth() + 1).padStart(2, '0')}${String(currentDate.getDate()).padStart(2, '0')}`;
      const currentTime = `${String(new Date().getHours()).padStart(2, '0')}${String(new Date().getMinutes()).padStart(2, '0')}`;

      let result = '';
    
      const f_1001 = this.formatField("!", 5, '!');
      const f_1002 = this.formatField(this.totalLists, 15, '0');
      const f_1003 = this.formatField(businessNumber, 9, '0');
      const f_1004 = this.formatField(uniqueId, 15, '0');
      const f_1005 = this.formatField("&OF1.31&", 8, '');
      const f_1006 = this.formatField("258001", 8, '0'); // מספר רישום התוכנה ברשות המיסים
      const f_1007 = this.formatField("KEEPINTAX", 20, '-');
      const f_1008 = this.formatField("version-001", 20, '-');
      const f_1009 = this.formatField("517134789", 9, "0"); // KEEPINTAX מספר עוסק של
      const f_1010 = this.formatField("KEEPINTAX", 20, '-');
      const f_1011 = this.formatField(2, 1, '0');
      const f_1012 = this.formatField(filePath, 50, '-');
      const f_1013 = this.formatField(1, 1, '0');
      const f_1014 = this.formatField(1, 1, '0');
      const f_1015 = this.formatField("517134789", 9, '0'); // מספר חברה ברשם החברות
      const f_1016 = this.formatField("000000000", 9, '0'); // מספר תיק ניכויים
      const f_1017 = this.formatField("!", 10, '!');
      const f_1018 = this.formatField("KEEPINTAX", 50, '-');
      const f_1019 = this.formatField("!", 50, '!');
      const f_1020 = this.formatField("!", 10, '!');
      const f_1021 = this.formatField("!", 30, '!');
      const f_1022 = this.formatField("!", 8, '!');
      const f_1023 = this.formatField("!", 4, '!');
      const f_1024 = this.formatField(startDate.replace(/-/g, ""), 8, '!');
      const f_1025 = this.formatField(endDate.replace(/-/g, ""), 8, '!');
      const f_1026 = this.formatField(formattedCurrentDate, 8, '!');
      const f_1027 = this.formatField(currentTime, 4, '!');
      const f_1028 = this.formatField(0, 1, '0');
      const f_1029 = this.formatField(1, 1, '0');
      const f_1030 = this.formatField("ZIP", 20, '!');
      const f_1032 = this.formatField("ILS", 3, '!');
      const f_1034 = this.formatField(0, 1, '0');
      const f_1035 = this.formatField("!", 46, '!');
      const c100 = `C100${this.formatField(this.recordSummary[`C100`], 15, '0')}`;
      const d110 = `D110${this.formatField(this.recordSummary[`D110`], 15, '0')}`;
      const d120 = `D120${this.formatField(this.recordSummary[`D120`], 15, '0')}`;
      const b100 = `B100${this.formatField(this.recordSummary[`B100`], 15, '0')}`;
      const b110 = `B110${this.formatField(this.recordSummary[`B110`], 15, '0')}`;
      const m100 = `M100${this.formatField(this.recordSummary[`M100`], 15, '0')}`;

      console.log("c100 records:", this.recordSummary[`C100`]);
      

      result += `A000${f_1001}${f_1002}${f_1003}${f_1004}${f_1005}${f_1006}${f_1007}${f_1008}${f_1009}${f_1010}${f_1011}${f_1012}${f_1013}${f_1014}${f_1015}${f_1016}${f_1017}${f_1018}${f_1019}${f_1020}${f_1021}${f_1022}${f_1023}${f_1024}${f_1025}${f_1026}${f_1027}${f_1028}${f_1029}${f_1030}${f_1032}${f_1034}${f_1035}\n${c100}\n${d110}\n${d120}\n${b100}\n${b110}\n${m100}\n`;
     
      return result;
    }


    // Function to generate a 15-digit unique random number
    private generateUniqueId(): string {
      return Math.floor(100000000000000 + Math.random() * 900000000000000).toString();
    }


    // Function to get current timestamp for folder naming (MMDDhhmm)
    private getCurrentTimestamp(): string {
      const now = new Date();
      return `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    }


    private async generateDataFileContent(userId: string, businessNumber: string, startDate: string, endDate: string, uniqueId: string): Promise<{ content: string; summary: any[] }> {

      let content = "";
      const documents = await this.fetchDocuments(businessNumber, startDate, endDate);
      console.log(`📄 Total documents fetched: ${documents.length}`);
      const journalEntries = await this.fetchJournalEntries(userId, businessNumber, startDate, endDate);
      console.log(`📄 Total journalEntries fetched: ${journalEntries.length}`);
    
      // Add A100 section first
      content += this.generateA100Section(businessNumber, uniqueId);

      // Add C100 section
      const c100 = await this.generateC100Section(documents);
      this.recordSummary.C100 += (c100.match(/\n/g) || []).length;
      content += c100;

      // Add D110 section
      const d110 = await this.generateD110Section(documents);      
      this.recordSummary.D110 += (d110.match(/\n/g) || []).length;
      content += d110;

      // Add D120 section
      const d120 = await this.generateD120Section(documents);
      this.recordSummary.D120 += (d120.match(/\n/g) || []).length;
      content += d120;

      // Add B100 section
      const b100 = await this.generateB100Section(journalEntries);
      this.recordSummary.B100 += (b100.match(/\n/g) || []).length;
      content += b100;

      // Add B110 section
      const b110 = await this.generateB110Section(businessNumber);
      this.recordSummary.B110 += (b110.match(/\n/g) || []).length;
      content += b110;

       // Add M100 section
       const m100 = await this.generateM100Section(businessNumber);
       this.recordSummary.M100 += (m100.match(/\n/g) || []).length;
       content += m100;

      //Calculate total lists
      this.totalLists = Object.values(this.recordSummary).reduce((sum, val) => sum + val, 0);

      // Add Z900 section first
      content += this.generateZ900Section(businessNumber, uniqueId);
      
      return { 
        content, 
        summary: Object.keys(this.recordSummary).map((key) => ({
          code: key,
          description: this.getRecordDescription(key), // Add descriptions
          count: this.recordSummary[key]
        }))
      };

    }


    private generateA100Section(businessNumber: string, uniqueId: string): string {
      return `A100${this.getFormattedRecordCounter()}${businessNumber}${uniqueId}&OF1.31&${'!'.repeat(50)}\r\n`;
    }


    private async generateC100Section(documents: Documents[]): Promise<string> {

      let result = '';
      documents.forEach((doc) => {
        const f_1201 = this.getFormattedRecordCounter();
        const f_1202 = this.formatField(doc.issuerBusinessNumber, 9, '0');
        const f_1203 = this.formatField(this.getDocumentTypeCode(doc.docType, false), 3, '0');
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
        const f_1216 = this.formatField(this.formatDateYYYYMMDD(doc.valueDate), 8, '!'); // תאריך ערך - לבדוק עם שריה
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
        const f_1234 = this.formatField(doc.generalDocIndex, 7, '0');
        const f_1235 = this.formatField("!", 13, '!');

        const debugMode = false; // Change to false for mission mode

        if (debugMode) {
          result += `C100\n\
          f_1201=${f_1201}\n\
          f_1202=${f_1202}\n\
          f_1203=${f_1203}\n\
          f_1204=${f_1204}\n\
          f_1205=${f_1205}\n\
          f_1206=${f_1206}\n\
          f_1207=${f_1207}\n\
          f_1208=${f_1208}\n\
          f_1209=${f_1209}\n\
          f_1210=${f_1210}\n\
          f_1211=${f_1211}\n\
          f_1212=${f_1212}\n\
          f_1213=${f_1213}\n\
          f_1214=${f_1214}\n\
          f_1215=${f_1215}\n\
          f_1216=${f_1216}\n\
          f_1217=${f_1217}\n\
          f_1218=${f_1218}\n\
          f_1219=${f_1219}\n\
          f_1220=${f_1220}\n\
          f_1221=${f_1221}\n\
          f_1222=${f_1222}\n\
          f_1223=${f_1223}\n\
          f_1224=${f_1224}\n\
          f_1225=${f_1225}\n\
          f_1226=${f_1226}\n\
          f_1228=${f_1228}\n\
          f_1230=${f_1230}\n\
          f_1231=${f_1231}\n\
          f_1233=${f_1233}\n\
          f_1234=${f_1234}\n\
          f_1235=${f_1235}\n`;
        } else {

          result += `C100${f_1201}${f_1202}${f_1203}${f_1204}${f_1205}${f_1206}${f_1207}${f_1208}${f_1209}${f_1210}${f_1211}${f_1212}${f_1213}${f_1214}${f_1215}${f_1216}${f_1217}${f_1218}${f_1219}${f_1220}${f_1221}${f_1222}${f_1223}${f_1224}${f_1225}${f_1226}${f_1228}${f_1230}${f_1231}${f_1233}${f_1234}${f_1235}\r\n`;
          
        }

      });
    
      return result;
    }


    private async generateD110Section(documents: Documents[]): Promise<string> {

      let result = '';
    
      for (const doc of documents) {

        // Fetch all matching lines for the current document
        const docLines = await this.docLinesRepo.find({
          where: {
            issuerBusinessNumber: doc.issuerBusinessNumber,
            generalDocIndex: doc.generalDocIndex,
            docType: Not(DocumentType.RECEIPT),
          },
        });


    
        docLines.forEach((line) => {
          
          const f_1251 = this.getFormattedRecordCounter();
          const f_1252 = this.formatField(doc.issuerBusinessNumber, 9, '0');
          const f_1253 = this.formatField(this.getDocumentTypeCode(doc.docType, false), 3, '0');
          const f_1254 = this.formatField(doc.docNumber, 20, '0');
          const f_1255 = this.formatField(line.lineNumber, 4, '0');
          const f_1256 = this.formatField(this.getDocumentTypeCode(doc.parentDocType, true), 3, '0');
          const f_1257 = this.formatField(doc.parentDocNumber, 20, '0');
          const f_1258 = this.formatField(line.transType, 1, '0');
          const f_1259 = this.formatField("175790433", 20, '0');
          const f_1260 = this.formatField(line.description, 30, '!');
          const f_1261 = this.formatField(line.manufacturerName, 50, '!');
          const f_1262 = this.formatField(line.productSerialNumber, 30, '!');
          const f_1263 = this.formatField(line.unitType, 20, '!');
          const f_1264 = this.formatAmount(line.unitQuantity, 12, 4);
          const f_1265 = this.formatAmount(line.sumBefVatPerUnit, 12, 2);
          const f_1266 = this.formatAmount(line.disBefVatPerLine, 12, 2);
          const f_1267 = this.formatAmount(line.sumAftDisBefVatPerLine, 12, 2);
          const f_1268 = this.formatAmount(line.vatRate, 2, 2, false);
          const f_1270 = this.formatField(doc.branchCode, 7, '0');
          const f_1272 = this.formatField(this.formatDateYYYYMMDD(doc.docDate), 8, '0');
          const f_1273 = this.formatField(line.generalDocIndex, 7, '0');
          const f_1274 = this.formatField("!", 7, '!');
          const f_1275 = this.formatField("!", 21, '!');

          result += `D110${f_1251}${f_1252}${f_1253}${f_1254}${f_1255}${f_1256}${f_1257}${f_1258}${f_1259}${f_1260}${f_1261}${f_1262}${f_1263}${f_1264}${f_1265}${f_1266}${f_1267}${f_1268}${f_1270}${f_1272}${f_1273}${f_1274}${f_1275}\r\n`;

        });
      }
    
      return result;
    }


    private async generateD120Section(documents: Documents[]): Promise<string> {

      let result = '';
    
      for (const doc of documents) {

        // Fetch all matching payments lines for the current document
        const docPayments = await this.docPaymentsRepo.find({
          where: {
            issuerBusinessNumber: doc.issuerBusinessNumber,
            generalDocIndex: doc.generalDocIndex,
          },
        });
    
        // Loop through the lines and create D120 records
        docPayments.forEach((line) => {
          const f_1301 = this.getFormattedRecordCounter(); // Running counter (9 digits)
          const f_1302 = this.formatField(doc.issuerBusinessNumber, 9, '0');
          const f_1303 = this.formatField(this.getDocumentTypeCode(doc.docType, false), 3, '0');
          const f_1304 = this.formatField(doc.docNumber, 20, '0');
          const f_1305 = this.formatField(line.paymentLineNumber, 4, '0');
          const f_1306 = this.formatField(this.getPaymentCode(line.paymentMethod), 1, '0');
          const f_1307 = this.formatField(line.bankNumber, 10, '0');
          const f_1308 = this.formatField(line.branchNumber, 10, '0');
          const f_1309 = this.formatField(line.accountNumber, 15, '0');
          const f_1310 = this.formatField(line.checkNumber, 10, '0');
          const f_1311 = this.formatField(this.formatDateYYYYMMDD(line.paymentDate), 8, '0');;
          const f_1312 = this.formatAmount(line.paymentAmount, 12, 2);
          const f_1313 = this.formatField(line.cardCompany, 1, '0');
          const f_1314 = this.formatField(line.creditCardName, 20, '0');
          const f_1315 = this.formatField(line.creditTransType, 1, '0');
          const f_1320 = this.formatField(doc.branchCode, 7, '0');
          const f_1322 = this.formatField(this.formatDateYYYYMMDD(doc.docDate), 8, '0');
          const f_1323 = this.formatField(line.generalDocIndex, 7, '0');
          const f_1324 = this.formatField("!", 60, '!');

          result += `D120${f_1301}${f_1302}${f_1303}${f_1304}${f_1305}${f_1306}${f_1307}${f_1308}${f_1309}${f_1310}${f_1311}${f_1312}${f_1313}${f_1314}${f_1315}${f_1320}${f_1322}${f_1323}${f_1324}\r\n`;

        });
      }
    
      return result;
    }


    private async generateB100Section(entries: JournalEntry[]): Promise<string> {

      let result = '';

      for (const entry of entries) {

        const lines = await this.JournalLineRepo.find({
          where: {
            journalEntryId: entry.id,
            issuerBusinessNumber: entry.issuerBusinessNumber,
          }
        });
  
        lines.forEach((line) => {
          const f_1351 = this.getFormattedRecordCounter();
          const f_1352 = this.formatField(entry.issuerBusinessNumber, 9, '0');
          const f_1353 = this.formatField(entry.id, 10, '0');
          const f_1354 = this.formatField(line.lineInEntry, 5, '0');
          const f_1355 = this.formatField(entry.id, 8, '0');
          const f_1356 = this.formatField("!", 15, '!');
          const f_1357 = this.formatField(entry.referenceId, 20, '0');
          const f_1358 = this.formatField(this.getDocumentTypeCode(entry.referenceType, false), 3, '0');
          const f_1359 = this.formatField("0", 20, '0');
          const f_1360 = this.formatField("0", 3, '0');
          const f_1361 = this.formatField("!", 50, '!');
          const f_1362 = this.formatField(this.formatDateYYYYMMDD(entry.date), 8, '0');;
          const f_1363 = this.formatField(this.formatDateYYYYMMDD(entry.date), 8, '0');;
          const f_1364 = this.formatField(line.accountCode, 15, '!');
          const f_1365 = this.formatField("!", 15, '!');
          const f_1366 = this.formatField(line.debit > 0 ? '1' : '2', 1, '0');
          const f_1367 = this.formatField("!", 3, '!');
          const f_1368 = this.formatAmount(line.debit > 0 ? line.debit : line.credit, 12, 2);
          const f_1369 = this.formatAmount(0, 12, 2);
          const f_1370 = this.formatAmount(0, 9, 2);
          const f_1371 = this.formatField("!", 10, '!');
          const f_1372 = this.formatField("!", 10, '!');
          const f_1374 = this.formatField("!", 7, '!');
          const f_1375 = this.formatField(this.formatDateYYYYMMDD(entry.createdAt), 8, '0');
          const f_1376 = this.formatField("!", 9, '!');
          const f_1377 = this.formatField("!", 25, '!');

          result += `B100${f_1351}${f_1352}${f_1353}${f_1354}${f_1355}${f_1356}${f_1357}${f_1358}${f_1359}${f_1360}${f_1361}${f_1362}${f_1363}${f_1364}${f_1365}${f_1366}${f_1367}${f_1368}${f_1369}${f_1370}${f_1371}${f_1372}${f_1374}${f_1375}${f_1376}${f_1377}\r\n`;

        });
      }
    
      return result;
    }


    private async generateB110Section(businessNumber: string): Promise<string> {

      let result = '';

      const accounts = await this.defaultBookingAccountRepo.find();

      for (const account of accounts) {
  
        const f_1401 = this.getFormattedRecordCounter();
        const f_1402 = this.formatField(businessNumber, 9, '0');
        const f_1403 = this.formatField(account.code, 15, '!');
        const f_1404 = this.formatField(account.name, 50, '!');
        const f_1405 = this.formatField("!", 15, '!');
        const f_1406 = this.formatField("!", 30, '!');
        const f_1407 = this.formatField("!", 50, '!');
        const f_1408 = this.formatField("!", 10, '!');
        const f_1409 = this.formatField("!", 30, '!');
        const f_1410 = this.formatField("!", 8, '!');
        const f_1411 = this.formatField("!", 30, '!');
        const f_1412 = this.formatField("!", 2, '!');
        const f_1413 = this.formatField("!", 15, '!');
        const f_1414 = this.formatAmount(0, 12, 2);
        const f_1415 = this.formatAmount(0, 12, 2);
        const f_1416 = this.formatAmount(0, 12, 2);
        const f_1417 = this.formatField("0", 4, '0');
        const f_1419 = this.formatField("!", 9, '!');
        const f_1421 = this.formatField("!", 7, '!');
        const f_1422 = this.formatAmount(0, 12, 2);
        const f_1423 = this.formatField("!", 3, '!');
        const f_1424 = this.formatField("!", 16, '!');

        result += `B110${f_1401}${f_1402}${f_1403}${f_1404}${f_1405}${f_1406}${f_1407}${f_1408}${f_1409}${f_1410}${f_1411}${f_1412}${f_1413}${f_1414}${f_1415}${f_1416}${f_1417}${f_1419}${f_1421}${f_1422}${f_1423}${f_1424}\r\n`;

      }
    
      return result;
    }


    private async generateM100Section(businessNumber: string): Promise<string> {

      let result = '';
    
      const f_1451 = this.getFormattedRecordCounter();
      const f_1452 = this.formatField(businessNumber, 9, '0');
      const f_1453 = this.formatField("0", 20, '0');
      const f_1454 = this.formatField("0", 20, '0');
      const f_1455 = this.formatField("175790433", 20, '0');
      const f_1456 = this.formatField("!", 50, '!');
      const f_1457 = this.formatField("!", 10, '!');
      const f_1458 = this.formatField("!", 30, '!'); 
      const f_1459 = this.formatField("!", 20, '!');
      const f_1460 = this.formatAmount(0, 9, 2);
      const f_1461 = this.formatAmount(0, 9, 2);
      const f_1462 = this.formatAmount(0, 9, 2);
      const f_1463 = this.formatField("0", 10, '0');
      const f_1464 = this.formatField("0", 10, '0');
      const f_1465 = this.formatField("!", 50, '!');

      result += `M100${f_1451}${f_1452}${f_1453}${f_1454}${f_1455}${f_1456}${f_1457}${f_1458}${f_1459}${f_1460}${f_1461}${f_1462}${f_1463}${f_1464}${f_1465}\r\n`;
    
      return result;
    }
    

    private generateZ900Section(businessNumber: string, uniqueId: string): string {
      return `Z900${this.getFormattedRecordCounter()}${businessNumber}${uniqueId}&OF1.31&${this.formatField(this.totalLists, 15, '0')}${'?'.repeat(50)}\r\n`;
    }


    async buildDocumentSummary(
      businessNumber: string,
      startDate: string | Date,
      endDate: string | Date,
    ): Promise<DocumentSummaryRow[]> {

      const rows = await this.documentsRepo
        .createQueryBuilder('d')
        .select('d.docType', 'docType')
        .addSelect('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(d.sumAftDisWithVAT), 0)', 'totalSum')
        .where('d.issuerBusinessNumber = :businessNumber', { businessNumber })
        .andWhere('d.docDate BETWEEN :from AND :to', { from: startDate, to: endDate })
        .groupBy('d.docType')
        .getRawMany<{ docType: DocumentType; count: string; totalSum: string }>();

      const summary: DocumentSummaryRow[] = rows
      .filter(row => DOC_TYPE_INFO[row.docType]) // only known types
      .map(row => {
        const { docNumber, docDescription } = DOC_TYPE_INFO[row.docType];
        return {
          docNumber,
          docDescription,
          totalDocs: Number(row.count),
          totalSum: parseFloat(row.totalSum),
        };
      });

      // compute grand totals
      const totalDocs = summary.reduce((sum, row) => sum + row.totalDocs, 0);
      const totalSum = summary.reduce((sum, row) => sum + row.totalSum, 0);

      // add the "total" row
      summary.push({
        docNumber: 'סה"כ' as any,  // force it since docNumber is typed as number
        docDescription: '',
        totalDocs,
        totalSum,
      });

      return summary;

    }


  async buildListSummary(): Promise<ListSummaryRow[]> {

    let list_summary: ListSummaryRow[] = [];

    list_summary = [
      { listNumber : "A100", listDescription: "רשומת פתיחה", listTotal: 1 },
      { listNumber : "B100", listDescription: "תנועות בהנהלת חשבונות", listTotal: this.recordSummary.B100 },
      { listNumber : "B110", listDescription: "חשבון בהנהלת חשבונות", listTotal: this.recordSummary.B110 },
      { listNumber : "C100", listDescription: "כותרת מסמך", listTotal: this.recordSummary.C100 },
      { listNumber : "D110", listDescription: "פרטי מסמך", listTotal: this.recordSummary.D110 },
      { listNumber : "D120", listDescription: "פרטי קבלות", listTotal: this.recordSummary.D120 },
      { listNumber : "M100", listDescription: "פריטים במלאי", listTotal: this.recordSummary.M100 },
      { listNumber : "Z900", listDescription: "רשומת סיום", listTotal: 1 },
    ];

    return list_summary;

  }

  async buildUniformSummaries(
    businessNumber: string,
    startDate: string | Date,
    endDate: string | Date,
  ): Promise<UniformSummaries> {
    const [document_summary, list_summary] = await Promise.all([
      this.buildDocumentSummary(businessNumber, startDate, endDate),
      this.buildListSummary(),
    ]);

    return { document_summary, list_summary };
  }


    private getRecordDescription(code: string): string {
      const descriptions: Record<string, string> = {
        A100: "רשומה פתיחה",
        B100: "תנועות בהנהלת חשבונות",
        B110: "חשבון בהנהלת חשבונות",
        C100: "כותרת מסמך",
        D110: "פרטי מסמך",
        D120: "פרטי קבלות",
        M100: "פריטים במלאי",
        Z900: "רשומת סיום"
      };
    
      return descriptions[code] || null;
    }


    // Format a field to a fixed length
    private formatField(value: string | number | Date, length: number, padChar: string = ' ', alignLeft: boolean = false): string {


      let strValue: string;

      if (value === null || value === undefined) {
        return padChar.repeat(length);
      }
  
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


    private formatAmount(value: number, intLength: number, decimalPlaces: number, withSign: boolean = true): string {
      const sign = value < 0 ? '-' : withSign ? '+' : '';
      const absValue = Math.abs(value);
    
      const [intPart, decPart] = absValue.toFixed(decimalPlaces).split('.');
    
      const paddedIntPart = intPart.padStart(intLength, '0');
      const paddedDecPart = decPart.padEnd(decimalPlaces, '0');
    
      return sign + paddedIntPart + paddedDecPart;
    }
    

    private getDocumentTypeCode(documentType: DocumentType | JournalReferenceType | null, allowNull: boolean): number | null {

      if (documentType === null) {
        if (allowNull) {
          return null;
        } else {
          throw new Error("Null document type is not allowed.");
        }
      }
        
      if (!(documentType in UniformFileTypeCodeMap)) {
        throw new Error(`Invalid document type: ${documentType}`);
      }
    
      return UniformFileTypeCodeMap[documentType];
    }
    

    private getPaymentCode(method: string): number {
      if ((method as keyof typeof PaymentMethodType) in PaymentMethodType) {
        return PaymentMethodType[method as keyof typeof PaymentMethodType];
      }
      return PaymentMethodType.OTHER;
    }


    // Format date to YYYYMMDD
    private formatDateYYYYMMDD(dateInput: Date | string): string {
      const date = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
      return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    }


    // Fetch documents by userId, businessNumber, startDate, and endDate
    async fetchDocuments(businessNumber: string, startDate: string, endDate: string): Promise<Documents[]> {
      return this.documentsRepo.find({
        where: {
          issuerBusinessNumber: businessNumber, // Only fetch documents issued by this business
          docDate: Between(new Date(startDate), new Date(endDate)),
        },
        order: { docDate: 'ASC' },
      });
    }

    
    async fetchJournalEntries(
      userId: string,
      issuerBusinessNumber: string,
      startDate: string,
      endDate: string
    ): Promise<JournalEntry[]> {
      return await this.JournalEntryRepo.find({
        where: {
          issuerBusinessNumber,
          date: Between(startDate, endDate),
        },
        order: {
          id: 'ASC',
        },
      });
    }
    


    async parseAndSaveDebugFile(fileName: string): Promise<string> {
      const inputFilePath = path.join(this.generatedFolder, fileName);
      const debugFilePath = path.join(this.debugFolder, fileName.replace('.TXT', '_DEBUG.TXT'));
  
      if (!fs.existsSync(inputFilePath)) {
        this.logger.error(`❌ File not found: ${inputFilePath}`);
        throw new Error(`File not found: ${fileName}`);
      }
  
      const fileStream = fs.createReadStream(inputFilePath);
      const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });
  
      const outputStream = fs.createWriteStream(debugFilePath);
      outputStream.write("====================================\n");
      outputStream.write("       DEBUG PARSED OUTPUT\n");
      outputStream.write("====================================\n\n");
  
      for await (const line of rl) {
        const fields = FIELD_MAP[line.substring(0, 4)]; // Get field definitions
      
        if (!fields) {
          this.logger.warn(`⚠ Unknown list type: ${line.substring(0, 4)}`);
          continue;
        }
      
        // Extract the first field (list name) and use it for the section title
        const firstField = fields[0]; // The first field is the list name
        const listName = line.substring(0, firstField.length).trim();
        outputStream.write(`==== ${listName} ====\n`);
      
        // Include the first field as the list type in the parsed output
        outputStream.write(`f_${firstField.field} = ${listName}      | ${firstField.description}\n`);
      
        // Start parsing from the second field onward
        let currentPosition = firstField.length;
        fields.slice(1).forEach(({ field, length, description }) => {
          const fieldValue = line.substring(currentPosition, currentPosition + length).trim();
          currentPosition += length;
          outputStream.write(`f_${field} = ${fieldValue}      | ${description}\n`);
        });
      
        outputStream.write("\n"); // Add a space between sections
      }
  
      outputStream.end();
      this.logger.log(`✅ Debug file created: ${debugFilePath}`);
      return debugFilePath;
    }


  async getDocsSummary(
    startDate: string,
    endDate: string,
    businessNumber: string,
  ): Promise<
    { docType: string; totalDocs: number; totalSum: number }[]
  > {
    return this.documentsRepo
      .createQueryBuilder('doc')
      .select('doc.docType', 'docType')
      .addSelect('COUNT(doc.id)', 'totalDocs')
      .addSelect('SUM(doc.sumAftDisWithVAT)', 'totalSum')
      .where('doc.issuerBusinessNumber = :businessNumber', { businessNumber })
      .andWhere('doc.docDate BETWEEN :startDate AND :endDate', { startDate, endDate })
      .groupBy('doc.docType')
      .getRawMany();
  }

    
}