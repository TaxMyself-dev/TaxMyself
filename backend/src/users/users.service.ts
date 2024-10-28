import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Any, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Child } from './child.entity';
import { CreateUserDto, createChildDto } from './dtos/create-user.dto';
import { UserRole, BusinessType, VATReportingType, TaxReportingType } from '../enum';
import { AuthService } from './auth.service';
import * as admin from 'firebase-admin';
import { UpdateUserDto } from './dtos/update-user.dto';
import { SharedService } from 'src/shared/shared.service';


@Injectable()
export class UsersService {

    public defaultApp: any;
    private readonly firebaseAuth: admin.auth.Auth;
    constructor
    (
        private readonly sharedService: SharedService,
        @InjectRepository(User) private user_repo: Repository<User>, 
        @InjectRepository(Child) private child_repo: Repository<Child>
    )
    {
        this.firebaseAuth = admin.auth();
    }
                              

    async signup({personal,spouse,children,business,validation}:any) {
        const newChildren = children?.children;

        console.log("signup in service");

       // personal.dateOfBirth = this.sharedService.convertDateStrToTimestamp(personal.dateOfBirth);
        console.log("personal.dateOfBirth is ", personal.dateOfBirth);
        //spouse.spouseDateOfBirth = this.sharedService.convertDateStrToTimestamp(spouse.spouseDateOfBirth);
        console.log("spouse.spouseDateOfBirth is ", spouse.spouseDateOfBirth);
        //business.businessDate = this.sharedService.convertDateStrToTimestamp(business.businessDate);
        console.log("business.businessDate is ", business.businessDate);



        // if (personal.dateOfBirth) {
        //     personal.dateOfBirth = new Date(personal.dateOfBirth).getTime();
        // }
        // if (spouse.spouseDateOfBirth) {
        //     spouse.spouseDateOfBirth = new Date(spouse.spouseDateOfBirth).getTime();
        // }
        // if (business.businessDate) {
        //     business.businessDate = new Date(business.businessDate).getTime();
        // }

        let newUser = {...personal, ...spouse, ...business};

        if (newChildren.length > 0) {
            for (let i = 0; i < newChildren.length; i++){
                const child: Child = newChildren[i];
                const newChild =  this.child_repo.create(child);
                newChild.fatherID = personal.firebaseId
                const addChild = await this.child_repo.save(newChild);
            }
        }

        if (newUser.businessType == BusinessType.EXEMPT) {
            console.log("newUser.businessType is EXEMPT"); 
            newUser.vatReportingType = VATReportingType.NOT_REQUIRED;
            newUser.taxReportingType = TaxReportingType.DUAL_MONTH_REPORT;
        }
        else if (newUser.businessType == BusinessType.LICENSED) {
            console.log("newUser.businessType is LICENSED");
            newUser.vatReportingType = VATReportingType.DUAL_MONTH_REPORT;
            newUser.taxReportingType = TaxReportingType.DUAL_MONTH_REPORT;
        }
        else if (newUser.businessType == BusinessType.COMPANY) {
            console.log("newUser.businessType is COMPANY");
            newUser.vatReportingType = VATReportingType.DUAL_MONTH_REPORT;
            newUser.taxReportingType = TaxReportingType.DUAL_MONTH_REPORT;
        }
        else {
            console.log("newUser.businessType is none of the option, is ", newUser.businessType);
            //throw new Error('User business type is not valid');
        }

        const user = this.user_repo.create(newUser);
        return this.user_repo.save(user);
    }


    async signin(token: string) {
        const firebaseId = await this.getFirbsaeIdByToken(token);
        const user = await this.findFireUser(firebaseId);
        //console.log("debug token:\n", token);
        return user;
    }


    async updateUser(userId: string, updateUserDto: UpdateUserDto): Promise<User> {

        const user = await this.user_repo.findOneBy({ firebaseId: userId });
        if (!user) {
          throw new Error('User not found');
        }

        // Field mapping between incoming fields and User entity fields
        // const fieldMapping = {
        //     'שם פרטי': 'fName',
        //     'שם משפחה': 'lName',
        //     'ת.ז': 'id',
        //     'תאריך לידה': 'dateOfBirth',
        //     'שם העסק': 'businessName',
        //     'סוג העסק': 'businessType',
        //     'מספר עוסק': 'businessId',
        //     'תאריך פתיחת העסק': 'businessDate'
        // };

        // Loop through the updateUserDto fields and map them to the correct fields
        // for (const key in updateUserDto) {
        //     if (updateUserDto.hasOwnProperty(key) && fieldMapping[key]) {
        //         user[fieldMapping[key]] = updateUserDto[key];
        //     }
        // }

        console.log("Before processing:", updateUserDto);

        // Convert date fields to timestamps
        const processedUserData = this.processDateFields(updateUserDto);
    
        // Assign updated fields to the user entity
        Object.assign(user, processedUserData);
        console.log("user is ", user);
        
        return this.user_repo.save(user);
    }


    private processDateFields(updateUserDto: any): any {

        const dateFields = ['dateOfBirth', 'businessDate'];  // List of fields expected to be dates
        const processedData = { ...updateUserDto };
    
        for (const key in processedData) {
          if (processedData.hasOwnProperty(key) && dateFields.includes(key)) {
            console.log("convert to date: ", key );
            processedData[key] = this.sharedService.convertDateStrToTimestamp(processedData[key]);
            console.log("after convert: ", processedData[key]);
            
          }
        }
    
        return processedData;
    }


    findFireUser(firebaseId: string) {
        return this.user_repo.find({ where: {firebaseId} })
    }


    async getFirbsaeIdByToken(token: string): Promise<string> {
        let uid: string;
        try {
            if (token != null && token != '') {
                const firebaseUserData = await this.firebaseAuth.verifyIdToken(token);
                uid = firebaseUserData.uid;
                if (uid != null && uid != '') {
                    return uid
                } else {
                    throw new HttpException({
                        status: HttpStatus.UNAUTHORIZED,
                        error: `invalid user`
                    }, HttpStatus.UNAUTHORIZED);
                }
            }else {
                throw new HttpException({
                    status: HttpStatus.UNAUTHORIZED,
                    error: `invalid user`
                }, HttpStatus.UNAUTHORIZED);
            }
        } catch (error) {
            throw new HttpException({
                status: HttpStatus.UNAUTHORIZED,
                error: `invalid user`
            }, HttpStatus.UNAUTHORIZED);
            
        }
    }


    async isAdmin(userId: string): Promise<boolean> {
        const user = await this.user_repo.findOneBy({firebaseId: userId});
        return user?.role === UserRole.ADMIN;
    }


}

// function convertDateStrToTimestamp(dateOfBirth: any): any {
//     throw new Error('Function not implemented.');
// }

