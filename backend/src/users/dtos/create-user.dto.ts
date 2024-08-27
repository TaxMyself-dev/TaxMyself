import { IsEmail, IsString, IsNumber, IsPhoneNumber, IsDateString, IsBoolean, IsArray, ValidateIf, IsOptional} from "class-validator";
import { LargeNumberLike } from "crypto";
import { ApiProperty } from '@nestjs/swagger'; // Import necessary decorators from '@nestjs/swagger' for API documentation


export class CreateUserDto {

    @IsString()
    fName: string;
    
    @IsString()
    lName: string;

    @IsString()
    id: string;
    
    @IsString()
    dateOfBirth: Date

    @IsPhoneNumber()
    phone: string;

    @IsEmail()
    email: string;

    @IsString()
    city: string;

    @IsString()
    familyStatus: string;

    @IsArray()
    children:[];

    @IsString()
    spouseFName: string;

    @IsString()
    spouseLName: string;

    @IsNumber()
    spouseId: string;

    @ValidateIf(o => o.familyStatus === 'נשוי')
    @IsString()
    @IsOptional()
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
}

export class createChildDto {
    @IsString()
    childFName: string;

    @IsString()
    childLName: string;

    @IsString()
    childID: string;

    @IsString()
    childDate: string;
}



// create-user.dto.ts
// export class PersonalInfoDto {
//     fName: string;
//     lName: string;
//     id: string;
//     email: string;
//     phone: string;
//     dateOfBirth: string;
//     employee: boolean;
//     city: string;
//     familyStatus: string;
//     firebaseId: string;
//   }
  
//   export class SpouseInfoDto {
//     spouseFName: string;
//     spouseLName: string;
//     spouseId: string;
//     spouseDateOfBirth: string;
//     spouseIndependet: boolean;
//     spousePhone: string;
//   }
  
//   export class ChildrenInfoDto {
//     children: string[];
//   }
  
//   export class BusinessInfoDto {
//     businessName: string;
//     businessField: string;
//     businessType: string;
//     businessDate: string;
//     businessID: string;
//   }
  
//   export class ValidationDto {
//     password: string;
//   }
  

// export class CreateUserDto {
//   @ApiProperty({ type: 'object', properties: {
//     fName: { type: 'string' },
//     lName: { type: 'string' },
//     id: { type: 'string' },
//     email: { type: 'string', format: 'email' },
//     phone: { type: 'string' },
//     dateOfBirth: { type: 'string', format: 'date' },
//     employee: { type: 'boolean' },
//     city: { type: 'string' },
//     familyStatus: { type: 'string' },
//     firebaseId: { type: 'string' },
//   }})
//   personal: PersonalInfoDto;

//   @ApiProperty({ type: 'object', properties: {
//     spouseFName: { type: 'string' },
//     spouseLName: { type: 'string' },
//     spouseId: { type: 'string' },
//     spouseDateOfBirth: { type: 'string', format: 'date' },
//     spouseIndependet: { type: 'boolean' },
//     spousePhone: { type: 'string' },
//   }})
//   spouse: SpouseInfoDto;

//   @ApiProperty({ type: 'object', properties: {
//     children: { type: 'array', items: { type: 'string' } },
//   }})
//   children: ChildrenInfoDto;

//   @ApiProperty({ type: 'object', properties: {
//     businessName: { type: 'string' },
//     businessField: { type: 'string' },
//     businessType: { type: 'string' },
//     businessDate: { type: 'string', format: 'date' },
//     businessID: { type: 'string' },
//   }})
//   business: BusinessInfoDto;

//   @ApiProperty()
//   validation: ValidationDto;
// }



