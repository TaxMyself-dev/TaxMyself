import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../expenses/expenses.entity';
import { VatReportDto } from './dtos/vat-report.dto';
import { PnLReportDto } from './dtos/pnl-report.dto';
import { VatReportRequestDto } from './dtos/vat-report-request.dto';
import { ReductionReportRequestDto } from './dtos/reduction-report-request.dto';
import { ReductionReportDto } from './dtos/reduction-report.dto';
import { ExpensesService } from '../expenses/expenses.service';
import { VAT_RATE_2023 } from '../constants';
import { SharedService } from 'src/shared/shared.service';


@Injectable()
export class ReportsService {
    constructor(
        @InjectRepository(Expense)
        private expense_repo: Repository<Expense>,
        private expensesService: ExpensesService,
        private sharedService: SharedService
    ) {}


    async createVatReport(
        userId: string,
        startDate: Date,
        endDate: Date,
        //isSingleMonth: boolean,
        //monthReport: number,
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
        const expenses = await this.expensesService.getExpensesForVatReport(userId, startDate, endDate);        
    
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
        userId: string,
        startDate: Date,
        endDate: Date
    ): Promise<PnLReportDto> {

        // Get total income
        const totalIncome = 1000;
        //  const totalIncome = await incomeRepo.createQueryBuilder("income")
        //  .select("SUM(income.amount)", "total")
        //  .where("income.userId = :userId", { userId })
        //  .andWhere("income.date BETWEEN :startDate AND :endDate", { startDate, endDate })
        //  .getRawOne();

        const expenses = await this.expensesService.getExpensesByDates(userId, startDate, endDate);

        console.log("expenses are ", expenses);

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

        // // Aggregate totalTaxPayable for non-equipment expenses by category
        // const totalTaxPayableByCategory = nonEquipmentExpenses.reduce((acc, expense) => {
        //     // Initialize category in accumulator if it does not already exist
        //     if (!acc[expense.category]) {
        //         acc[expense.category] = 0;
        //     }
        //     // Convert totalTaxPayable to a number and add it to its category total
        //     acc[expense.category] += 7; //parseFloat(expense.totalTaxPayable);
        //     return acc;
        // }, {});

        console.log("totalTaxPayableByCategory is ", totalTaxPayableByCategory);

        // const report: PnLReportDto = {
        //     income: parseFloat(totalIncome.total),
        //     expenses: expensesByCategory.map(exp => ({
        //         category: exp.category,
        //         total: parseFloat(exp.total)
        //     }))
        // };

        const report: PnLReportDto = {
            income: totalIncome,
            expenses: []
        };

        return report;
        
    }
        

    async createReductionReport(userId: string, year: number): Promise<ReductionReportDto[]> {

        const startDate = new Date(year, 0, 1); // 1st January of the year
        const endDate = new Date(year, 11, 31); // 31st December of the year
    
        const expenses = await this.expense_repo
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