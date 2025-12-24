import {
    IsString,
    IsNumber,
    IsDateString,
    IsBoolean,
    IsOptional,
} from 'class-validator'


export class CreateClientDto {

    @IsString()
    id: string;
   
    @IsString()
    name: string;

    @IsString()
    phone: string;

    @IsString()
    email: string;

    @IsString()
    city: string;

    @IsString()
    state: string;

    @IsString()
    street: string;

    @IsString()
    homeNumber: string;

    @IsString()
    postalCode: string;

    @IsString()
    stateCode: string;
}