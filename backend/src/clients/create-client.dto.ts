import {
    IsString,
    IsNumber,
    IsDateString,
    IsBoolean,
    IsOptional,
} from 'class-validator'


export class CreateClientDto {

    @IsString()
    @IsOptional()
    id: string;
   
    @IsString()
    name: string;

    @IsString()
    businessNumber: string;

    @IsString()
    @IsOptional()
    phone: string;

    @IsString()
    @IsOptional()
    email: string;

    @IsString()
    @IsOptional()
    city: string;

    @IsString()
    @IsOptional()
    state: string;

    @IsString()
    @IsOptional()
    street: string;

    @IsString()
    @IsOptional()
    homeNumber: string;
}