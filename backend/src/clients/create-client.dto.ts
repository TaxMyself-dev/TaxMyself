import {
    IsString,
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
    address: string;
}