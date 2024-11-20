import {
    IsString,
} from 'class-validator'


export class CreateBillDto {

    @IsString()
    billName: string;

    @IsString()
    businessNumber: string;
    
}