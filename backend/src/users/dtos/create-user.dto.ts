import { IsEmail, IsString, IsNumber, IsPhoneNumber, IsDateString} from "class-validator";
import { LargeNumberLike } from "crypto";

export class CreateUserDto {

    @IsString()
    fName: string;
    
    @IsString()
    lName: string;

    @IsNumber()
    idCard: string;

    @IsEmail()
    email: string;

    @IsPhoneNumber()
    phone: string;

    @IsDateString()
    dateOfBirth: string;

    @IsString()
    password: string;

    //children

    @IsString()
    spouseFName: string;

    @IsString()
    spouseLName: string;

    @IsNumber()
    spouseId: string;

    @IsDateString()
    spouseDateOfBirth: string;

    @IsString()
    firebaseId: string;

}