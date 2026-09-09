/**
 * One row of the Form 1342 depreciation report — column numbers follow the
 * Israeli Tax Authority form layout (1..11). All amounts are ILS.
 */
export class Form1342ReportRowDto {
    /** Internal source expense id; used only for opening the asset editor. */
    expenseId: number;

    /** 1 — Asset name / description (supplier field on the Expense row) */
    assetName: string;

    /** 2 — Purchase date (ISO yyyy-mm-dd) */
    purchaseDate: string;

    /** 3 — Activation/in-service date. Defaults to purchase date for legacy rows. */
    activationDate: string;

    /** 4 — Original cost / acquisition price */
    originalCost: number;

    /** 5 — Changes during the year (always 0) */
    changesDuringYear: number;

    /** 6 — Total depreciable cost (4 + 5) */
    depreciableCost: number;

    /** 7 — Statutory depreciation rate (%) */
    depreciationRatePerLaw: number;

    /** UI metadata — deductible income-tax percentage of the annual depreciation. */
    taxRecognitionPercent: number;

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
    /** UI capability only; backend write endpoints remain authoritative. */
    canManageExpenses?: boolean;

    /** Tax year the report was generated for */
    year: number;

    /** One row per equipment asset */
    rows: Form1342ReportRowDto[];

    /** SUM of column 4 across all rows */
    totalOriginalCost: number;

    /** SUM of column 5 across all rows */
    totalChangesDuringYear: number;

    /** SUM of column 6 across all rows */
    totalDepreciableCost: number;

    /** SUM of column 8 across all rows */
    totalCurrentYearDepreciation: number;

    /** SUM of column 9 across all rows */
    totalPriorYearsDepreciation: number;

    /** SUM of column 10 across all rows */
    totalDepreciation: number;

    /** SUM of column 11 across all rows */
    totalRemainingBalance: number;
}
