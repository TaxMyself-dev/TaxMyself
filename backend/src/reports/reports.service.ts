import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from '../expenses/expenses.entity';
import { VatReportDto } from './dtos/vat-report.dto';
import { VatReportRequestDto } from './dtos/vat-report-request.dto';
import { ReductionReportRequestDto } from './dtos/reduction-report-request.dto';
import { ReductionReportDto } from './dtos/reduction-report.dto';
import { ExpensesService } from '../expenses/expenses.service';
import { VAT_RATE_2023 } from '../constants';


@Injectable()
export class ReportsService {
    constructor(
        @InjectRepository(Expense)
        private expense_repo: Repository<Expense>,
        private expensesService: ExpensesService
    ) {}


    async createVatReport(
        userId: string,
        isSingleMonth: boolean,
        monthReport: number,
        vatableTurnover: number,
        nonVatableTurnover: number
    ): Promise<VatReportDto> {

        console.log("createVatReport - start");
        
        const vatReport: VatReportDto = {
            vatableTurnover: vatableTurnover,
            nonVatableTurnover: nonVatableTurnover,
            vatRefundOnAssets: 0,
            vatRefundOnExpenses: 0,
            vatPayment: 0
        };
    
        // Step 1: Fetch expenses using the function we wrote based on monthReport
        const expenses = await this.expensesService.getExpensesForVatReport(userId, isSingleMonth, monthReport);        
    
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
                billDate: expense.dateTimestamp,
                activeDate: expense.dateTimestamp,
                redunctionPercnet: expense.reductionPercent,
                redunctionForPeriod: calculatedValue
            } as unknown as ReductionReportDto;
          });

        console.log("reductionList:", reductionList);
        return reductionList;

    }

    
}