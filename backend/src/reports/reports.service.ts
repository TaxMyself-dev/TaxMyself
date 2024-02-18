import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Expense } from 'src/expenses/expenses.entity';
import { VatReportDto } from './dtos/vat-report.dto';
import { VatReportRequestDto } from './dtos/vat-report-request.dto';
import { ReductionReportRequestDto } from './dtos/reduction-report-request.dto';
import { ReductionReportDto } from './dtos/reduction-report.dto';
import { ExpensesService } from 'src/expenses/expenses.service';
import { VAT_RATE_2023 } from 'src/constants';


@Injectable()
export class ReportsService {
    constructor(
        @InjectRepository(Expense)
        private expense_repo: Repository<Expense>,
        private expensesService: ExpensesService
    ) {}


    async createVatReport(vatReportRequest: VatReportRequestDto): Promise<VatReportDto> {

        const vatReport: VatReportDto = {
            vatableTurnover: vatReportRequest.vatableTurnover,
            nonVatableTurnover: vatReportRequest.nonVatableTurnover,
            vatRefundOnAssets: 0,
            vatRefundOnExpenses: 0,
            vatPayment: 0
        };

        console.log('getTotalExpenses - start');

        const vatRegularExpensesSum = await this.expense_repo.createQueryBuilder('expense')
            .select("SUM(expense.sum * expense.vatPercent / 100)", "total")
            .where('expense.userId = :userId', { userId: vatReportRequest.userId })
            .andWhere('expense.equipment = :equipment', { equipment: false })
            .andWhere('expense.date >= :startDate AND expense.date <= :endDate', { startDate: vatReportRequest.startDate, 
                endDate: vatReportRequest.endDate })
            .getRawOne();

        vatReport.vatRefundOnExpenses = Math.round(vatRegularExpensesSum.total * (1 - (1 / (1 + VAT_RATE_2023))));

        const vatAssetsExpensesSum = await this.expense_repo.createQueryBuilder('expense')
        .select("SUM(expense.sum * expense.vatPercent / 100)", "total")
        .where('expense.userId = :userId', { userId: vatReportRequest.userId })
        .andWhere('expense.equipment = :equipment', { equipment: true })
        .andWhere('expense.date >= :startDate AND expense.date <= :endDate', { startDate: vatReportRequest.startDate, 
            endDate: vatReportRequest.endDate })
        .getRawOne();

        vatReport.vatRefundOnAssets = Math.round(vatAssetsExpensesSum.total * (1 - (1 / (1 + VAT_RATE_2023))));

        vatReport.vatPayment = Math.round(vatReportRequest.vatableTurnover*(1 + VAT_RATE_2023)) - vatReport.vatRefundOnExpenses - vatReport.vatRefundOnAssets;

        // console.log(filter);

        // // Fetch individual expenses
        // const expenses = await this.expense_repo.createQueryBuilder('expense')
        //     .select(['expense.id', 'expense.sum', 'expense.vatPercent', 'expense.date'])
        //     .where('expense.userId = :userId', { userId: filter.userId })
        //     //.andWhere('expense.equipment = :equipment', { equipment: false })
        //     .andWhere('expense.date >= :startDate AND expense.date <= :endDate', { startDate: filter.startDate, endDate: filter.endDate })
        //     .getMany();
    
        // // Log each expense
        // expenses.forEach(expense => {
        //     console.log('Expense:', expense);
        // });

        return vatReport;
    }


    async createReductionReport(userId: string, year: number): Promise<ReductionReportDto[]> {
    //async createReductionReport(userId: string, year: number): Promise<any[]> {

        const startDate = new Date(year, 0, 1); // 1st January of the year
        const endDate = new Date(year, 11, 31); // 31st December of the year
    
        const expenses = await this.expense_repo
          .createQueryBuilder("expense")
          .select(["expense.date", "expense.sum", "expense.category", "expense.reductionPercent"])
          .where("expense.userId = :userId", { userId })
          .andWhere("expense.isEquipment = :isEquipment", { isEquipment: true })
          .andWhere("expense.date BETWEEN :startDate AND :endDate", { startDate, endDate })
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



//     async findUserEquipmentExpensesForYear(userId: number, year: number): Promise<ExpenseSummaryDTO[]> {

//     const startDate = new Date(year, 0, 1); // 1st January of the year
//     const endDate = new Date(year, 11, 31); // 31st December of the year

//     const expenses = await this.expenseRepository
//       .createQueryBuilder("expense")
//       .select(["expense.date", "expense.sum", "expense.reductionPercent"])
//       .where("expense.userId = :userId", { userId })
//       .andWhere("expense.isEquipment = :isEquipment", { isEquipment: true })
//       .andWhere("expense.date BETWEEN :startDate AND :endDate", { startDate, endDate })
//       .getMany();

//     return expenses.map(expense => {
//       const calculatedValue = expense.sum * (expense.reductionPercent / 100);
//       return {
//         date: expense.date,
//         sum: expense.sum,
//         calculatedValue: calculatedValue
//       } as ExpenseSummaryDTO;
//     });
//   }
}