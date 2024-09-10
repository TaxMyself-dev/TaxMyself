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
        // console.log("yearStr: ", yearStr, "monthStr: ", monthStr);

        if (yearStr === undefined || monthStr === undefined) {
            return {startDate: null, endDate: null};
        }
        else {
            //console.log("isSingleMonth = ", isSingleMonth);

            // Ensure `isSingleMonth` is a boolean
            isSingleMonth = typeof isSingleMonth === 'string' ? isSingleMonth === 'true' : isSingleMonth;
            //console.log("isSingleMonth = ", isSingleMonth, " (type:", typeof isSingleMonth, ")");

            const year = parseInt(yearStr, 10);
            const month = parseInt(monthStr, 10) - 1; // `date-fns` uses 0-based months

            // Start date is always the first day of the specified month in UTC
            let startDate = new Date(Date.UTC(year, month, 1));
            // Calculate the end date in UTC
            let endDate: Date;
            if (isSingleMonth) {
                // Last day of the specified month
                // console.log("single true");

                endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
            } else {
                // Last day of the next month
                // console.log("single false");
                endDate = new Date(Date.UTC(year, month + 2, 0, 23, 59, 59, 999));
            }
            //console.log("getStartAndEndDate - debug:\n startDate is ", startDate, "\nendDate is ", endDate);

            return { startDate, endDate };
        }

    }


    getDayOfYearFromDate(date: Date): number {
        // Assuming the input format is "DD.MM.YYYY"
        const formatString = 'dd.MM.yyyy';
        const formatDate = parse("31.12.2023", formatString, new Date());
        const dayOfYear = getDayOfYear(formatDate);
        // console.log(dayOfYear);  
        return (dayOfYear)
    }


    getReductionForYear(activeDate: Date, year: number, reductionPercent: number): number {
        let daysForReduction: number;
        const dayOfYear = this.getDayOfYearFromDate(activeDate);
        const activeYear = activeDate.getFullYear();
        const yearsForReduction = 1 / (reductionPercent / 100) + 2;
        if (year == activeYear) {
            daysForReduction = (reductionPercent / 365) * (365 - dayOfYear);
        }

        return daysForReduction;
    }


    convertDateStrToTimestamp(dateStr: string): number {

        // console.log("Original dateStr is ", dateStr);

        // Split the date string into day, month, and year
        let dateParts = dateStr.split('/');
        if (dateParts.length !== 3) {
            throw new BadRequestException(`Invalid date format provided: ${dateStr}. Please use the format dd/MM/yyyy.`);
        }

        // Pad day and month with leading zeros if necessary
        let day = dateParts[0].padStart(2, '0');
        let month = dateParts[1].padStart(2, '0');
        let year = dateParts[2];

        // If year is two digits, add the "20" prefix
        if (year.length === 2) {
            year = '20' + year;
        }

        // Reconstruct the date string with normalized values
        dateStr = `${day}/${month}/${year}`;

        // console.log("Normalized dateStr is ", dateStr);

        // Regex to check if the fixed date format is dd/MM/yyyy
        const dateFormatPattern = /^\d{2}\/\d{2}\/\d{4}$/;

        // Validate the fixed date format
        if (!dateFormatPattern.test(dateStr)) {
            throw new BadRequestException(`Invalid date format provided after fix: ${dateStr}. Please use the format dd/MM/yyyy.`);
        }

        // Try parsing the date string with date-fns using the format "dd/MM/yyyy"
        //const date = new Date(`${year}-${month}-${day}T00:00:00`);

        // Use Date.UTC() to ensure the date is created in UTC
        const date = new Date(Date.UTC(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10)));


        // console.log("Parsed date is ", date);

        if (isNaN(date.getTime())) {
            throw new BadRequestException(`Invalid date format provided: ${dateStr}. Please use a valid ISO 8601 date format.`);
        }

        const timeStampDate = Math.floor(date.getTime() / 1000);
        // console.log("timeStampDate is ", timeStampDate);

        return timeStampDate;

    }


    convertDateToTimestamp(date: Date): number {
        if (date === null) {
            return null;
        }
        if (isNaN(date.getTime())) {
            throw new BadRequestException(`Invalid date format provided: ${date}. Please use a valid ISO 8601 date format.`);
        }
        return Math.floor(date.getTime() / 1000);
    }


}
