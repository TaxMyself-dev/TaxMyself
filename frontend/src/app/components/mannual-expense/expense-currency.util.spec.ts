import { expenseCurrencyFormValue, expenseCurrencyPayload } from './expense-currency.util';

describe('manual expense currency mapping', () => {
    it('prefills a USD edit from raw original values, not the formatted display sum', () => {
        expect(expenseCurrencyFormValue({
            sum: '$16.8', sumRaw: -62.16, originalSum: -16.8, originalCurrency: 'usd',
        })).toEqual({ currency: 'USD', sum: 16.8 });
    });

    it('prefills an ILS edit from the raw ILS value, not the formatted display sum', () => {
        expect(expenseCurrencyFormValue({
            sum: '1,234 ש"ח', sumRaw: -1234, originalSum: null, originalCurrency: null,
        })).toEqual({ currency: 'ILS', sum: 1234 });
    });

    it('builds foreign and ILS edit payloads with an explicit currency transition', () => {
        expect(expenseCurrencyPayload(20, 'usd', true)).toEqual({
            sum: 20, originalSum: 20, originalCurrency: 'USD',
        });
        expect(expenseCurrencyPayload(75, 'ILS', true)).toEqual({
            sum: 75, originalCurrency: 'ILS',
        });
        expect(expenseCurrencyPayload(75, 'ILS', false)).toEqual({ sum: 75 });
    });
});
