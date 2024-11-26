//shared.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityTarget, FindOptionsWhere, Between, Timestamp } from 'typeorm';
import { parse, format, getDayOfYear } from 'date-fns';
import { Expense } from '../expenses/expenses.entity';
import { Transactions } from '../transactions/transactions.entity';
import { VATReportingType, SingleMonthReport, DualMonthReport } from 'src/enum';
import * as annualParams from 'src/annual.params.json';


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
        if (yearStr === undefined || monthStr === undefined) {
            return { startDate: null, endDate: null };
        }
    
        isSingleMonth = typeof isSingleMonth === 'string' ? isSingleMonth === 'true' : isSingleMonth;
    
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10) - 1;
    
        // Start date: first day of the specified month at 00:00:00 UTC
        const startDate = new Date(Date.UTC(year, month, 1));
    
        // End date: last day of the month or the following month at 23:59:59 UTC
        const endDate = isSingleMonth
            ? new Date(Date.UTC(year, month + 1, 0, 23, 59, 59)) // Last day of the specified month
            : new Date(Date.UTC(year, month + 2, 0, 23, 59, 59)); // Last day of the next month
    
        return { startDate, endDate };
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


    getVATReportingDate(date: Date, vatReportingType: VATReportingType): SingleMonthReport | DualMonthReport {

        const monthIndex = date.getMonth(); // Returns 0-based month index (e.g., 0 for January)
        const month = monthIndex + 1; // Adjust to 1-based month (e.g., 1 for January)
        const year = date.getFullYear();

        let result: SingleMonthReport | DualMonthReport | null = null;
    
        if (vatReportingType === VATReportingType.SINGLE_MONTH_REPORT) {
        result = `${month}/${year}` as SingleMonthReport;
        console.log("SingleMonthReport - result is ", result);
        
        }
        else if (vatReportingType === VATReportingType.DUAL_MONTH_REPORT) {
            const dualMonthPairs = {
                1: `1-2/${year}`,
                2: `1-2/${year}`,
                3: `3-4/${year}`,
                4: `3-4/${year}`,
                5: `5-6/${year}`,
                6: `5-6/${year}`,
                7: `7-8/${year}`,
                8: `7-8/${year}`,
                9: `9-10/${year}`,
                10: `9-10/${year}`,
                11: `11-12/${year}`,
                12: `11-12/${year}`,
            };  
            result = dualMonthPairs[month] as DualMonthReport;
            console.log("DualMonthReport - result is ", result);
        }
        else {
            result = null;
            console.log("null - result is ", result);
        }        

        return result;
    
    }


    convertStringToDateObject(dateString): Date {        

        const parts = dateString.split('/'); // Split the input string by '/'
        if (parts.length !== 3) {
            throw new Error("Invalid date format. Please use 'dd/MM/yyyy'.");
        }
        
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1; // JavaScript months are zero-indexed
        const year = parseInt(parts[2], 10);
    
        // Validate that day, month (adjusted for zero-index), and year are numeric and in valid ranges
        if (!Number.isInteger(day) || !Number.isInteger(month + 1) || !Number.isInteger(year)) {
            throw new Error("Date components must be numeric and within correct ranges.");
        }
    
        // Creating a date in UTC
        const date = new Date(Date.UTC(year, month, day));
        //console.log("check: ", date.toISOString());  // Outputs "2024-01-01T00:00:00.000Z"

        // Check if the constructed date matches the input parts to catch invalid dates like February 30
        if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
            throw new Error("Invalid date: The date does not exist on the calendar.");
        }
    
        return date;
    }


    getParameters(year: number) {
        const parameters = annualParams[year];
        if (!parameters) {
          throw new Error(`Parameters for year ${year} are not defined.`);
        }
        return parameters;
    }


    getVatPercent(year: number): number {
        const parameters = this.getParameters(year);
        return parameters.vatPercent / 100; // Convert percent to decimal
    }


}