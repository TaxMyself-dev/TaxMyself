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

    @IsString()
    category: string;

    @IsString()
    subCategory: string;

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
}