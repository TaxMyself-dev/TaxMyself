import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../expenses/expenses.entity';
import { VatReportDto } from './dtos/vat-report.dto';
import { ExpensePnlDto, PnLReportDto } from './dtos/pnl-report.dto';
import { VatReportRequestDto } from './dtos/vat-report-request.dto';
import { ReductionReportRequestDto } from './dtos/reduction-report-request.dto';
import { ReductionReportDto } from './dtos/reduction-report.dto';
import { ExpensesService } from '../expenses/expenses.service';
import { VAT_RATE_2023 } from '../constants';
import { SharedService } from 'src/shared/shared.service';
import { User } from '../users/user.entity';
import { BusinessType} from 'src/enum';



@Injectable()
export class ReportsService {
    constructor(
        @InjectRepository(Expense)
        private expenseRepo: Repository<Expense>,
        @InjectRepository(User) private userRepo: Repository<User>,
        private expensesService: ExpensesService,
        private sharedService: SharedService
    ) {}


    async createVatReport(
        userId: string,
        businessNumber: string,
        startDate: Date,
        endDate: Date,
        vatableTurnover: number,
        nonVatableTurnover: number
    ): Promise<VatReportDto> {
        
        const vatReport: VatReportDto = {
            vatableTurnover: vatableTurnover,
            nonVatableTurnover: nonVatableTurnover,
            vatRefundOnAssets: 0,
            vatRefundOnExpenses: 0,
            vatPayment: 0
        };
    
        // Step 1: Fetch expenses using the function we wrote based on monthReport
        const expenses = await this.expensesService.getExpensesForVatReport(userId, businessNumber, startDate, endDate);        
    
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
        vatReport.vatPayment = Math.round(vatableTurnover * VAT_RATE_2023) - vatReport.vatRefundOnExpenses - vatReport.vatRefundOnAssets;
    
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

        console.log("reports.service - pnl-report start");

        // Get total income
        let totalIncome = 1170;
        //  const totalIncome = await incomeRepo.createQueryBuilder("income")
        //  .select("SUM(income.amount)", "total")
        //  .where("income.userId = :userId", { userId })
        //  .andWhere("income.date BETWEEN :startDate AND :endDate", { startDate, endDate })
        //  .getRawOne();

        if (user.businessType === BusinessType.LICENSED || user.businessType === BusinessType.COMPANY) {
            totalIncome = totalIncome / 1.17;
        }

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

        // Calculate the total expenses using a for loop
        let totalExpenses = 0;
        for (const expense of expenseDtos) {
            totalExpenses += expense.total;
        }

        const reducionExpenses = this.createReductionReport(firebaseId, businessNumber, year);

        // Calculate net profit before tax
        const netProfitBeforeTax = totalIncome - totalExpenses;

        // Construct the final report
        const report: PnLReportDto = {
            income: totalIncome,
            expenses: expenseDtos,
            netProfitBeforeTax,
        };
        
        return report;
        
    }
        

    async createReductionReport(firebaseId: string, businessNumber: string, year: number): Promise<ReductionReportDto[]> {

        const expenses = await this.expensesService.getExpensesForReductionReport(firebaseId, businessNumber, year);

        return this.calculateReductionsForExpenses(expenses, year)

    }

      
    calculateReductionsForExpenses(
        expenses: Expense[],
        requiredYear: number
      ): ReductionReportDto[] {
        // Use map to transform each expense into a ReductionReportDto
        return expenses.map((expense) => {
          const { supplier: name, date, sum, reductionPercent } = expense;
          let pastReduction = 0;
          let currentReduction = 0;
      
          // Calculate total reduction years for the expense
          const totalReductionYears = this.calculateReductionYears(reductionPercent, date);
      
          // Iterate through the years from the purchase year to the required year
          for (let year = date.getFullYear(); year <= requiredYear; year++) {
            const yearFraction =
              this.calculateYearlyReductionFraction(year, date, reductionPercent, totalReductionYears);
            const yearReduction = (yearFraction / 100) * sum;
      
            if (year < requiredYear) {
              // Accumulate reduction for past years
              pastReduction += yearReduction;
            } else if (year === requiredYear) {
              // Add reduction for the required year
              currentReduction = yearReduction;
            }
          }
      
          // Create and return a DTO matching ReductionReportDto
          return {
            name,
            date,
            redunctionPercent: reductionPercent.toFixed(2), // Convert reduction percent to string
            currentRedunction: Math.min(currentReduction, sum - pastReduction), // Prevent over-reduction
            pastRedunction: Math.min(pastReduction, sum), // Ensure reduction doesn't exceed the total sum

          } as ReductionReportDto; // Explicitly cast to ReductionReportDto
        });
      }
      
      

    calculateReductionYears(reductionPercent: number, date: Date): number {
      
        const purchaseMonth = date.getMonth() + 1; // חודשים מתחילים מ-0
        const isPartialYear = purchaseMonth > 1 || date.getDate() > 1;
      
        // חישוב מספר השנים כולל שנה נוספת אם השנה הראשונה חלקית
        const fullYears = Math.ceil(100 / reductionPercent);
        const totalYears = fullYears + (isPartialYear ? 1 : 0);
      
        return totalYears;
    }


    calculateYearlyReductionFraction(
        year: number,
        date: Date,
        reductionPercent: number,
        totalReductionYears: number
      ): number {

        const purchaseYear = date.getFullYear();
      
        // If the given year is before the purchase year or after the total reduction period
        if (year < purchaseYear || year > purchaseYear + totalReductionYears - 1) {
          return 0;
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
            return (reductionPercent * daysRemaining) / daysInYear;
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
          return reductionPercent;
        }
      }
      
      // Helper function to determine if a year is a leap year
      isLeapYear(year: number): boolean {
        return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      }

    
}