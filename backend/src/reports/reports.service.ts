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

@Injectable()
export class ReportsService {
    constructor(
        private expensesService: ExpensesService 
        //@InjectRepository(Report) private repo: Repository<Report>,
        //@InjectRepository(Expense) private expense_repo: Repository<Expense>,
    ) {}

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
