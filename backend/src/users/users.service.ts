import { HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Any, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Child } from './child.entity';
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

        personal.dateOfBirth = this.sharedService.parseDateStringToDate(personal.dateOfBirth, 'yyyy-MM-dd');
        spouse.spouseDateOfBirth = this.sharedService.parseDateStringToDate(spouse.spouseDateOfBirth, 'yyyy-MM-dd');
        business.businessDate = this.sharedService.parseDateStringToDate(business.businessDate, 'yyyy-MM-dd');

        let newUser = {...personal, ...spouse, ...business};

        if (newChildren.length > 0) {
            for (let i = 0; i < newChildren.length; i++){
                const child: Child = newChildren[i];
                const newChild =  this.child_repo.create(child);
                newChild.fatherID = personal.firebaseId;
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

        // Convert date fields to timestamps
        const processedUserData = this.processDateFields(updateUserDto);
    
        // Assign updated fields to the user entity
        Object.assign(user, processedUserData);
        return this.user_repo.save(user);
        
    }


    private processDateFields(updateUserDto: any): any {

        const dateFields = ['dateOfBirth', 'businessDate'];  // List of fields expected to be dates
        const processedData = { ...updateUserDto };
    
        for (const key in processedData) {
          if (processedData.hasOwnProperty(key) && dateFields.includes(key)) {
            console.log("convert to date: ", key );
            processedData[key] = this.sharedService.parseDateStringToDate(processedData[key], "dd/MM/yyyy");
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