//shared.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityTarget, FindOptionsWhere, Between, Timestamp } from 'typeorm';
import { startOfMonth, endOfMonth } from 'date-fns';


import { parse } from 'date-fns';
import { getDayOfYear } from 'date-fns';

import { Expense } from 'src/expenses/expenses.entity';
import { Transactions } from 'src/transactions/transactions.entity';

@Injectable()
export class SharedService {

    constructor(
        @InjectRepository(Expense)
        private readonly expenseRepository: Repository<Expense>,
        @InjectRepository(Transactions)
        private readonly transactionRepository: Repository<Transactions>,
    ) {}


    async findEntities<T>(entity: EntityTarget<T>, conditions: any): Promise<T[]> {
        const repository = this.getRepository(entity);
        const whereConditions = this.buildWhereConditions<T>(conditions);
        return repository.find({ where: whereConditions });
    }
  

    private getRepository<T>(entity: EntityTarget<T>): Repository<T> {
        switch (entity) {
            case Expense:
                return this.expenseRepository as unknown as Repository<T>;
            case Transactions:
                return this.transactionRepository as unknown as Repository<T>;
            default:
                throw new Error('Repository not found for given entity');
        }
    }


    private buildWhereConditions<T>(conditions: any): FindOptionsWhere<T> {
        const whereConditions: FindOptionsWhere<T> = {};
        for (const [key, value] of Object.entries(conditions)) {
            if (key === 'startDate' || key === 'endDate') continue;
            whereConditions[key] = value;
        }
        if (conditions.startDate && conditions.endDate) {
            whereConditions['date'] = Between(new Date(conditions.startDate), new Date(conditions.endDate));
        }
        return whereConditions;
    }


    getStartAndEndDate(yearStr: string, monthStr: string, isSingleMonth: boolean) {

        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10) - 1; // `date-fns` uses 0-based months
    
        // Start date is always the first day of the specified month in UTC
        let startDate = new Date(Date.UTC(year, month, 1));
        // Calculate the end date in UTC
        let endDate: Date;
        if (isSingleMonth) {
            // Last day of the specified month
            endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
        } else {
            // Last day of the next month
            endDate = new Date(Date.UTC(year, month + 2, 0, 23, 59, 59, 999));
        }
        return { startDate, endDate };
    }


    getDayOfYearFromDate(date: Date): number {
        // Assuming the input format is "DD.MM.YYYY"
        const formatString = 'dd.MM.yyyy';
        const formatDate = parse("31.12.2023", formatString, new Date());
        const dayOfYear = getDayOfYear(formatDate);
        console.log(dayOfYear);  
        return(dayOfYear)
    }


    getReductionForYear(activeDate: Date, year: number, reductionPercent: number): number {
        let daysForReduction: number;
        const dayOfYear = this.getDayOfYearFromDate(activeDate);
        const activeYear = activeDate.getFullYear();
        const yearsForReduction = 1/(reductionPercent/100) + 2;
        if (year == activeYear) {
            daysForReduction = (reductionPercent/365) * (365-dayOfYear);
        }

        return daysForReduction;
    }
    
    
    convertDateStrToTimestamp(dateStr: string): number {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) {
          throw new BadRequestException(`Invalid date format provided: ${dateStr}. Please use a valid ISO 8601 date format.`);
        }
        return Math.floor(date.getTime() / 1000);
    }


    convertDateToTimestamp(date: Date): number {
        if (isNaN(date.getTime())) {
          throw new BadRequestException(`Invalid date format provided: ${date}. Please use a valid ISO 8601 date format.`);
        }
        return Math.floor(date.getTime() / 1000);
    }


}
