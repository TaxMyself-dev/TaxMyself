import { IsEmail, IsString, IsNumber, IsPhoneNumber, IsDateString, IsBoolean, IsArray} from "class-validator";
import { LargeNumberLike } from "crypto";

export class CreateUserDto {

    @IsString()
    fName: string;
    
    @IsString()
    lName: string;

    @IsString()
    id: string;
    
    @IsString()
    date: Date

    @IsPhoneNumber()
    phone: string;

    @IsEmail()
    email: string;

    @IsString()
    city: string;

    @IsArray()
    children:[];

    //password?
    


    @IsBoolean()
    haveChild: boolean;

    @IsString()
    spouseFName: string;

    @IsString()
    spouseLName: string;

    @IsNumber()
    spouseId: string;

    @IsString()
    spouseDateOfBirth: Date;

    @IsBoolean()
    spouseIndependet: boolean;

    @IsString()
    firebaseId: string;

    @IsString()
    businessName: string;

    @IsString()
    businessField: string;

    @IsString()
    businessType: string;

    @IsBoolean()
    employee: boolean;


    // @IsDateString()
    // spouseDateOfBirth: string;


}