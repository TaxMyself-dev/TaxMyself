import { HttpException, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
import { BusinessType} from 'src/enum';
import { TransactionsService } from 'src/transactions/transactions.service';
import { Transactions } from 'src/transactions/transactions.entity';
import axios from 'axios';



@Injectable()
export class ReportsService {
    constructor(
        @InjectRepository(Expense)
        private expenseRepo: Repository<Expense>,
        @InjectRepository(Expense)
        private transactionsRepo: Repository<Transactions>,
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

    
}