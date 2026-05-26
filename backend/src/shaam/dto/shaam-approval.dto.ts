import {
  IsString,
  IsNumber,
  IsDateString,
  Matches,
  ValidateIf,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';
import { Type } from 'class-transformer';

@ValidatorConstraint({ name: 'PaymentAmountValidation', async: false })
export class PaymentAmountValidator implements ValidatorConstraintInterface {
  validate(value: any, args: ValidationArguments): boolean {
    const object = args.object as ShaamApprovalDto;
    const paymentAmount = object.payment_amount || 0;
    const vatAmount = object.vat_amount || 0;
    const paymentAmountIncludingVat = object.payment_amount_including_vat || 0;
    
    const expected = paymentAmount + vatAmount;
    const difference = Math.abs(paymentAmountIncludingVat - expected);
    
    return difference <= 0.01;
  }

  defaultMessage(args: ValidationArguments): string {
    return 'payment_amount_including_vat must equal payment_amount + vat_amount (tolerance: 0.01)';
  }
}

export class ShaamApprovalDto {
  @IsNumber()
  @Type(() => Number)
  user_id: number;

  @IsNumber()
  @Type(() => Number)
  accounting_software_number: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  amount_before_discount: number;

  @IsNumber()
  @Type(() => Number)
  customer_vat_number: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  discount: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'invoice_date must be in YYYY-MM-DD format',
  })
  invoice_date: string;

  @IsString()
  invoice_id: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'invoice_issuance_date must be in YYYY-MM-DD format',
  })
  invoice_issuance_date: string;

  @IsString()
  invoice_reference_number: string;

  @IsNumber()
  @Type(() => Number)
  invoice_type: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  payment_amount: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  @Validate(PaymentAmountValidator)
  payment_amount_including_vat: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Type(() => Number)
  vat_amount: number;

  @IsNumber()
  @Type(() => Number)
  vat_number: number;
}


