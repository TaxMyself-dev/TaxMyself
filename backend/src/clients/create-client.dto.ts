import {
    IsString,
    IsNumber,
    IsDateString,
    IsBoolean,
    IsOptional,
} from 'class-validator'


export class CreateClientDto {

    @IsString()
    userId: string;

    @IsString()
    name: string;

    @IsString()
    phone: string;

    @IsString()
    email: string;

    @IsString()
    address: string;
}