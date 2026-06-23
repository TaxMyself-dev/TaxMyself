/**
 * One row of the Form 1342 depreciation report — column numbers follow the
 * Israeli Tax Authority form layout (1..11). All amounts are ILS.
 */
export class Form1342ReportRowDto {
    /** 1 — Asset name / description (supplier field on the Expense row) */
    assetName: string;

    /** 2 — Purchase date (ISO yyyy-mm-dd) */
    purchaseDate: string;

    /** 3 — Activation date. Same as purchase date — Expense entity has no separate column */
    activationDate: string;

    /** 4 — Original cost / acquisition price */
    originalCost: number;

    /** 5 — Changes during the year (always 0) */
    changesDuringYear: number;

    /** 6 — Depreciation rate (%) */
    depreciationRate: number;

    /** 7 — Depreciation rate per law (= column 6) */
    depreciationRatePerLaw: number;

    /** 8 — Depreciation claimed for the selected tax year */
    currentYearDepreciation: number;

    /** 9 — Accumulated depreciation from prior years */
    priorYearsDepreciation: number;

    /** 10 — Total depreciation (8 + 9) */
    totalDepreciation: number;

    /** 11 — Remaining balance (4 − 10) */
    remainingBalance: number;
}

export class Form1342ReportDto {
    /** Tax year the report was generated for */
    year: number;

    /** One row per equipment asset */
    rows: Form1342ReportRowDto[];

    /** SUM of column 4 across all rows */
    totalOriginalCost: number;

    /** SUM of column 8 across all rows */
    totalCurrentYearDepreciation: number;

    /** SUM of column 9 across all rows */
    totalPriorYearsDepreciation: number;

    /** SUM of column 10 across all rows */
    totalDepreciation: number;

    /** SUM of column 11 across all rows */
    totalRemainingBalance: number;
}
