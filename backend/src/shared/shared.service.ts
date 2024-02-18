//shared.service.ts

import { Injectable } from '@nestjs/common';

import { parse } from 'date-fns';
import { getDayOfYear } from 'date-fns';

@Injectable()
export class SharedService {

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



}
