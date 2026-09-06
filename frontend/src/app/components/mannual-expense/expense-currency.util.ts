export interface ExpenseCurrencyEditRow {
    sum?: unknown;
    sumRaw?: unknown;
    originalSum?: unknown;
    originalCurrency?: unknown;
}

export interface ExpenseCurrencyFormValue {
    currency: string;
    sum: number | null;
}

/** Resolve edit fields only from raw API values, never formatted table text. */
export function expenseCurrencyFormValue(row: ExpenseCurrencyEditRow): ExpenseCurrencyFormValue {
    const originalCurrency = typeof row.originalCurrency === 'string'
        ? row.originalCurrency.trim().toUpperCase()
        : '';
    const originalSum = finiteNumberOrNull(row.originalSum);
    const isForeign = originalCurrency !== '' && originalCurrency !== 'ILS' && originalSum != null;

    return isForeign
        ? { currency: originalCurrency, sum: Math.abs(originalSum) }
        : { currency: 'ILS', sum: absoluteNumberOrNull(row.sumRaw ?? row.sum) };
}

/** On edit, explicit ILS tells the backend to clear stale original FX fields. */
export function expenseCurrencyPayload(
    enteredSum: number | null,
    currency: string | null | undefined,
    editMode: boolean,
): { sum: number | null; originalSum?: number; originalCurrency?: string } {
    const code = (currency ?? 'ILS').trim().toUpperCase() || 'ILS';
    if (code !== 'ILS' && enteredSum != null) {
        return { sum: enteredSum, originalSum: enteredSum, originalCurrency: code };
    }
    return editMode
        ? { sum: enteredSum, originalCurrency: 'ILS' }
        : { sum: enteredSum };
}

function finiteNumberOrNull(value: unknown): number | null {
    if (value == null || value === '') return null;
    const numberValue = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
}

function absoluteNumberOrNull(value: unknown): number | null {
    const numberValue = finiteNumberOrNull(value);
    return numberValue == null ? null : Math.abs(numberValue);
}
