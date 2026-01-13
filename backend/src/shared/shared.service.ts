//shared.service.ts

import { Injectable, BadRequestException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityTarget, FindOptionsWhere, Between, Timestamp } from 'typeorm';
import { parse, format, getDayOfYear } from 'date-fns';
import { Expense } from '../expenses/expenses.entity';
import { Transactions } from '../transactions/transactions.entity';
import { VATReportingType, SingleMonthReport, DualMonthReport, VAT_RATES } from 'src/enum';
import * as annualParams from 'src/annual.params.json';
import { SettingDocuments } from '../documents/settingDocuments.entity';
import { DocumentType } from 'src/enum';
import { EntityManager } from 'typeorm';


@Injectable()
export class SharedService {

    constructor(
        @InjectRepository(Expense)
        private readonly expenseRepository: Repository<Expense>,
        @InjectRepository(Transactions)
        private readonly transactionRepository: Repository<Transactions>,
        @InjectRepository(SettingDocuments)
        private readonly settingDocumentsRepo: Repository<SettingDocuments>,
    ) { }


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


    convertStringToDateObject(dateString: string): Date {
        const parts = dateString.split('/');
        if (parts.length !== 3) {
            throw new Error("Invalid date format. Expected 'dd/MM/yyyy'.");
        }

        const day = Number(parts[0]);
        const month = Number(parts[1]) - 1; // zero-index
        const year = Number(parts[2]);

        // Basic numeric validation
        if (!Number.isInteger(day) || !Number.isInteger(month + 1) || !Number.isInteger(year)) {
            throw new Error("Invalid numeric values in date.");
        }

        // Range validation BEFORE creating Date
        if (day < 1 || day > 31) throw new Error(`Invalid day '${day}'.`);
        if (month < 0 || month > 11) throw new Error(`Invalid month '${month + 1}'.`);
        if (year < 1000 || year > 9999) throw new Error(`Invalid year '${year}'.`);

        // Create UTC date
        const date = new Date(Date.UTC(year, month, day));

        // Validate real calendar date (catches 31/02, 29/02 non-leap-year, etc.)
        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month ||
            date.getUTCDate() !== day
        ) {
            throw new Error("Invalid date: does not exist on the calendar.");
        }

        return date;
    }

    normalizeToMySqlDate(input: any): string | null {
        if (!input) return null;

        const d = new Date(input);

        if (isNaN(d.getTime())) {
            return null; // invalid date
        }

        return d.toISOString().split('T')[0]; // YYYY-MM-DD
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


    getVatRateByYear(date: Date): number {
        const year = date.getFullYear();
        const vatRate = VAT_RATES[year];

        if (vatRate === undefined) {
            throw new InternalServerErrorException(`VAT rate for year ${year} not found`);
        }

        return vatRate;
    }


    async getJournalEntryCurrentIndex(userId: string, manager?: EntityManager): Promise<number> {
        const repo = manager
            ? manager.getRepository(SettingDocuments)
            : this.settingDocumentsRepo;

        let setting = await repo.findOne({
            where: {
                userId,
                docType: DocumentType.JOURNAL_ENTRY,
            },
        });

        if (!setting) {
            setting = repo.create({
                userId,
                docType: DocumentType.JOURNAL_ENTRY,
                initialIndex: 10000000,
                currentIndex: 10000000,
            });

            await repo.save(setting);
        }

        return setting.currentIndex;
    }


    // async incrementJournalEntryIndex(userId: string): Promise<void> {
    //     const setting = await this.settingDocumentsRepo.findOneOrFail({
    //       where: {
    //         userId,
    //         docType: DocumentType.JOURNAL_ENTRY,
    //       },
    //     });

    //     setting.currentIndex += 1;
    //     await this.settingDocumentsRepo.save(setting);
    // }


    async incrementJournalEntryIndex(userId: string, manager?: EntityManager): Promise<void> {
        const repo = manager
            ? manager.getRepository(SettingDocuments)
            : this.settingDocumentsRepo;

        const setting = await repo.findOneOrFail({
            where: {
                userId,
                docType: DocumentType.JOURNAL_ENTRY,
            },
        });

        setting.currentIndex += 1;
        await repo.save(setting);
    }


}