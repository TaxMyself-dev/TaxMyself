import { IsIsraeliPhone } from 'src/shared/israeli-phone';
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
    @IsIsraeliPhone()
    phone: string;

    @IsString()
    @IsOptional()
    email: string;

    @IsString()
    @IsOptional()
    address: string;
}