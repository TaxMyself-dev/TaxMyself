import {
    IsString,
} from 'class-validator'


export class CreateBillDto {

    @IsString()
    token: string;

    @IsString()
    billName: string;
    
}