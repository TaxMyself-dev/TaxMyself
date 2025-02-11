import {
    IsString,
    IsNumber,
    IsDateString,
    IsBoolean,
    IsOptional,
    isString
} from 'class-validator'


export class CreateClientDto {


   @IsString()
    Name: string;

    @IsString()
    phone: string;

    @IsString()
    email: string;

    @IsString()
    address: string;
}