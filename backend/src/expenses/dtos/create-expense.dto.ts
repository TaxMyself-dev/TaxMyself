import {
    IsString,
    IsNumber,
    IsDateString,
    IsBoolean,
    IsOptional
} from 'class-validator'


export class CreateExpenseDto {


    @IsString()
    supplier: string;

    @IsOptional()
    @IsString()
    supplierID: string;

    @IsOptional()
    @IsString()
    expenseNumber: string;

    /**
     * D1/Phase 4.1: direct pointer at the sub_category row. When present it
     * wins over the legacy category/subCategory name pair below; the names
     * remain accepted (and required in practice by the unchanged Angular
     * forms) until Phase 4.6 retires the name fallback.
     */
    @IsOptional()
    @IsNumber()
    subCategoryId?: number;

    @IsOptional()
    @IsString()
    category?: string;

    @IsOptional()
    @IsString()
    subCategory?: string;

    @IsNumber()
    sum: number;

    @IsNumber()
    taxPercent: number;

    @IsNumber()
    vatPercent: number;

    @IsDateString()
    date: Date;

    @IsOptional()
    @IsString()
    note: string;

    @IsOptional()
    @IsString()
    file: string;

    @IsOptional()
    @IsBoolean()
    isEquipment?: boolean;

    // @IsOptional()
    // @IsString()
    // equipmentCategory: string;

    @IsOptional()
    @IsNumber()
    reductionPercent: number;

    /**
     * Optional currency override for foreign-currency manual entries.
     * When supplied (and != 'ILS'), the backend converts `originalSum`
     * using the BOI rate on `date` and stores the result in `sum` (ILS).
     * `sum` should NOT be sent in this case — server-side trust is the
     * conversion path only.
     */
    @IsOptional()
    @IsString()
    originalCurrency?: string;

    @IsOptional()
    @IsNumber()
    originalSum?: number;

    /**
     * Soft-duplicate override. When a previously-saved Expense matches on
     * (supplier, sum, date) but NOT on the document number, addExpense
     * normally rejects with a `DUPLICATE_WARNING` so the UI can ask the
     * user "looks like a possible duplicate — save anyway?". Re-sending
     * the same payload with this flag set to `true` acknowledges the
     * warning and lets the save through. It never bypasses the hard
     * `DUPLICATE_EXACT` block (same document number → truly the same row).
     */
    @IsOptional()
    @IsBoolean()
    acknowledgeDuplicate?: boolean;
}