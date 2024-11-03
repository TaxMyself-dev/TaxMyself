//shared.service.ts

import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityTarget, FindOptionsWhere, Between, Timestamp } from 'typeorm';
import { parse, format, getDayOfYear } from 'date-fns';
import { Expense } from '../expenses/expenses.entity';
import { Transactions } from '../transactions/transactions.entity';
import { VATReportingType, SingleMonthReport, DualMonthReport } from 'src/enum';

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


    // getStartAndEndDate(yearStr: string, monthStr: string, isSingleMonth: boolean) {
    //     // console.log("yearStr: ", yearStr, "monthStr: ", monthStr);

    //     if (yearStr === undefined || monthStr === undefined) {
    //         return {startDate: null, endDate: null};
    //     }
    //     else {
    //         //console.log("isSingleMonth = ", isSingleMonth);

    //         // Ensure `isSingleMonth` is a boolean
    //         isSingleMonth = typeof isSingleMonth === 'string' ? isSingleMonth === 'true' : isSingleMonth;
    //         //console.log("isSingleMonth = ", isSingleMonth, " (type:", typeof isSingleMonth, ")");

    //         const year = parseInt(yearStr, 10);
    //         const month = parseInt(monthStr, 10) - 1; // `date-fns` uses 0-based months

    //         // Start date is always the first day of the specified month in UTC
    //         let startDate = new Date(Date.UTC(year, month, 1));
    //         // Calculate the end date in UTC
    //         let endDate: Date;
    //         if (isSingleMonth) {
    //             // Last day of the specified month
    //             // console.log("single true");

    //             endDate = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    //         } else {
    //             // Last day of the next month
    //             // console.log("single false");
    //             endDate = new Date(Date.UTC(year, month + 2, 0, 23, 59, 59, 999));
    //         }
    //         //console.log("getStartAndEndDate - debug:\n startDate is ", startDate, "\nendDate is ", endDate);

    //         return { startDate, endDate };
    //     }

    // }



    getStartAndEndDate(yearStr: string, monthStr: string, isSingleMonth: boolean) {
        if (yearStr === undefined || monthStr === undefined) {
            return { startDate: null, endDate: null };
        }
    
        // console.log("yearStr is ", yearStr);
        // console.log("monthStr is ", monthStr);
        // console.log("isSingleMonth is ", isSingleMonth);
    
        isSingleMonth = typeof isSingleMonth === 'string' ? isSingleMonth === 'true' : isSingleMonth;
    
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10) - 1;
    
        // Start date: first day of the specified month at 00:00:00 UTC
        const startDate = new Date(Date.UTC(year, month, 1));
    
        // End date: last day of the month or the following month at 23:59:59 UTC
        const endDate = isSingleMonth
            ? new Date(Date.UTC(year, month + 1, 0, 23, 59, 59)) // Last day of the specified month
            : new Date(Date.UTC(year, month + 2, 0, 23, 59, 59)); // Last day of the next month
    
        // console.log("startDate is ", startDate);
        // console.log("type of startDate is ", typeof startDate);
        // console.log("endDate is ", endDate);
        // console.log("type of endDate is ", typeof endDate);
    
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


    parseDateStringToDate(dateString: string, inputFormat: string): Date {

        console.log("Input dateString:", dateString);  // Log the input to confirm it’s not undefined
        console.log("Input format:", inputFormat);

        try {
            // Parse the date string based on the provided format
            const parsedDate = parse(dateString, inputFormat, new Date());
    
            // Check if the parsed date is valid
            if (isNaN(parsedDate.getTime())) {
                throw new Error('Invalid date');
            }
    
            // Return the Date object
            return parsedDate;
        } catch (error) {
            throw new Error(`Failed to parse date: ${dateString} with format: ${inputFormat}`);
        }
    }


}