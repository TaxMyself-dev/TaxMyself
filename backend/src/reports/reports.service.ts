import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Report } from './report.entity'; 
import { Expense } from 'src/expenses/expenses.entity';
import { CreateReportDto } from './dtos/create-report.dto';
import { User } from 'src/users/user.entity';
import { GetEstimateDto } from './dtos/get-estimate.dto';
import { VatReportDto } from './dtos/vat-report.dto';
import { ExpensesService } from 'src/expenses/expenses.service';
import { ExpenseFilterDto } from 'src/expenses/dtos/expense-filter.dto';

import { VAT_RATE_2023 } from 'src/constants';



@Injectable()
export class ReportsService {
    constructor(
        private expensesService: ExpensesService,
        @InjectRepository(Expense) private expense_repo: Repository<Expense>
    ) {}


    async getTotalExpenses(filter: ExpenseFilterDto): Promise<VatReportDto> {

        const vatReport: VatReportDto = {
            taxableTrans17: 0,
            taxableTrans18: 0,
            exemptTrans: 0,
            recognizeExpenses17: 0,
            recognizeExpenses18: 0,
            recognizeEquipExpenses17: 0,
            recognizeEquipExpenses18: 0
        };

        console.log('getTotalExpenses - start');

        console.log(filter);

        // Fetch individual expenses
        const expenses = await this.expense_repo.createQueryBuilder('expense')
            .select(['expense.id', 'expense.sum', 'expense.vatPercent', 'expense.date'])
            .where('expense.userId = :userId', { userId: filter.userId })
            .andWhere('expense.equipment = :equipment', { equipment: false })
            .andWhere('expense.date >= :startDate AND expense.date <= :endDate', { startDate: filter.startDate, endDate: filter.endDate })
            .getMany();
    
        // Log each expense
        expenses.forEach(expense => {
            console.log('Expense:', expense);
        });
    
        // Calculate the total using your existing logic
        const result = await this.expense_repo.createQueryBuilder('expense')
            .select("SUM(expense.sum * expense.vatPercent / 100)", "total")
            .where('expense.userId = :userId', { userId: filter.userId })
            .andWhere('expense.equipment = :equipment', { equipment: false })
            .andWhere('expense.date >= :startDate AND expense.date <= :endDate', { startDate: filter.startDate, 
                endDate: filter.endDate })
            .getRawOne();
    
        console.log("Total = ", result.total);
    
        vatReport.recognizeExpenses17 = result.total * (1 - (1 / (1 + (VAT_RATE_2023 / 100))));

        return vatReport;
    }
    
    // async createVatReport(startDate: string, endDate: string, userId: string): Promise<VatReportDto> {
    //     const expenseList = this.expensesService.getExpensesWithinDateRange(startDate, endDate)
    //     const vatReportDto: VatReportDto = {
    //         taxableTrans17: 0,
    //         taxableTrans18: 0,
    //         exemptTrans: 0,
    //         recognizeExpenses17: 0,
    //         recognizeExpenses18: 0,
    //         recognizeEquipExpenses17: 0,
    //         recognizeEquipExpenses18: 0
    //     };
    //     //this.expense_repo
    //     //    .createQueryBuilder('expense')
    //     //    .where('expense.userId = :userId', { userId })
    //     //    .andWhere('expense.date >= :startDate', { startDate })
    //     //    .andWhere('expense.date <= :endDate', { endDate })
    //     //    .orderBy('expense.date', 'ASC')
    //     //    .getMany();
    //     return vatReportDto;
    // }

    //createEstimate(estimateDto: GetEstimateDto) {
    //    return this.repo.createQueryBuilder()
    //    .select('*')
    //    .getRawMany()
    //}

    // create(reportDto: CreateReportDto, user: User) {
    //     const report = this.repo.create(reportDto);
    //     report.user = user;
    //     return this.repo.save(report);
    // }

    //async changeApproval(id: string, approved: boolean) {
    //    const report = await this.repo.findOne({where: { id: parseInt(id)} });
    //    if (!report) {
    //        throw new NotFoundException('report not found');
    //    }
    //
    //    report.approved = approved;
    //    return this.repo.save(report);
    //
    //}
}
