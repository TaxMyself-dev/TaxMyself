import {
    IsString,
} from 'class-validator'


export class CreateSourceDto {

    @IsString()
    token: string;

    @IsString()
    sourceName: string;
    
}