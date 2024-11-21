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
import { BusinessType } from 'src/enum';



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
        

    async createReductionReport(userId: string, year: number): Promise<ReductionReportDto[]> {

        const startDate = new Date(year, 0, 1); // 1st January of the year
        const endDate = new Date(year, 11, 31); // 31st December of the year
    
        const expenses = await this.expenseRepo
          .createQueryBuilder("expense")
          .select(["expense.dateTimestamp", "expense.sum", "expense.category", "expense.reductionPercent"])
          .where("expense.userId = :userId", { userId })
          .andWhere("expense.isEquipment = :isEquipment", { isEquipment: true })
          .andWhere("expense.dateTimestamp BETWEEN :startDate AND :endDate", { startDate, endDate })
          .getMany();

        console.log(expenses);
        const reductionList =  expenses.map(expense => {
            const calculatedValue = expense.sum * (expense.reductionPercent / 100);
            return {
                category: expense.category,
                billDate: expense.date,
                activeDate: expense.date,
                redunctionPercnet: expense.reductionPercent,
                redunctionForPeriod: calculatedValue
            } as unknown as ReductionReportDto;
          });

        console.log("reductionList:", reductionList);
        return reductionList;

    }

    
}