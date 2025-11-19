import { HttpException, HttpStatus, Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { Any, LessThan, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Child } from './child.entity';
import { UserRole, BusinessType, VATReportingType, TaxReportingType, FamilyStatus, EmploymentType, PayStatus, ModuleName, BusinessStatus } from '../enum';
import { AuthService } from './auth.service';
import * as admin from 'firebase-admin';
import { UpdateUserDto } from './dtos/update-user.dto';
import { SharedService } from 'src/shared/shared.service';
import { CityDto } from './dtos/city.dto';
import axios from 'axios';
import { Business } from 'src/business/business.entity';


@Injectable()
export class UsersService {

    public defaultApp: any;
    private readonly firebaseAuth: admin.auth.Auth;
    constructor
    (
        private readonly sharedService: SharedService,
        @InjectRepository(User) private user_repo: Repository<User>, 
        @InjectRepository(Business) private business_repo: Repository<Business>, 
        @InjectRepository(Child) private child_repo: Repository<Child>
    )
    {
        this.firebaseAuth = admin.auth();
    }


    async signup_new({ personal, spouse, children, business }: any) {

      console.log("signup_new - start");

      console.log("🧍 personal:", personal);
      console.log("🤝 spouse:", spouse);
      console.log("👶 children:", children);
      console.log("🏢 business:", business);

      // ✅ 1️⃣ Extract arrays correctly (in case frontend sends wrapped data)
      const newChildren = children?.childrenArray ?? [];
      const newBusinesses: Partial<Business>[] = business?.businessArray ?? [];

      // ✅ 2️⃣ Create base user object (no business fields here)
      const newUser = {
        ...personal,
        ...spouse,
        role: [UserRole.REGULAR],
        finsiteId: 0,
        createdAt: new Date(),
        subscriptionEndDate: new Date(),
        payStatus: PayStatus.TRIAL,
        modulesAccess: [ModuleName.INVOICES, ModuleName.OPEN_BANKING],
      };

      newUser.subscriptionEndDate.setMonth(newUser.subscriptionEndDate.getMonth() + 2);

      // ✅ 4️⃣ Determine two-business owner flag
      if (newBusinesses.length === 0) {
        newUser.businessStatus = BusinessStatus.NO_BUSINESS;
      } else if (newBusinesses.length === 1) {
        newUser.businessStatus = BusinessStatus.SINGLE_BUSINESS;
      } else {
        newUser.businessStatus = BusinessStatus.MULTI_BUSINESS; 
      }

      // ✅ 5️⃣ Save user first
      const user = this.user_repo.create(newUser);
      const savedUser = await this.user_repo.save(user);

      // ✅ 6️⃣ Save all children (if any)
      for (const child of newChildren) {
        const newChild = this.child_repo.create({
          ...child,
          parentUserID: personal.firebaseId,
        });
        await this.child_repo.save(newChild);
      }

      // ✅ 7️⃣ Save all businesses (if any)
      for (const biz of newBusinesses) {
        if (!biz) continue;

        const newBusiness = this.business_repo.create({
          ...biz,
          firebaseId: personal.firebaseId,
        });

        // Apply VAT & tax logic per business type
        switch (newBusiness.businessType) {
          case BusinessType.EXEMPT:
            newBusiness.vatReportingType = VATReportingType.NOT_REQUIRED;
            newBusiness.taxReportingType = TaxReportingType.DUAL_MONTH_REPORT;
            break;
          case BusinessType.LICENSED:
          case BusinessType.COMPANY:
            newBusiness.vatReportingType = VATReportingType.DUAL_MONTH_REPORT;
            newBusiness.taxReportingType = TaxReportingType.DUAL_MONTH_REPORT;
            break;
          default:
            newBusiness.vatReportingType = VATReportingType.NOT_REQUIRED;
            newBusiness.taxReportingType = TaxReportingType.NOT_REQUIRED;
            break;
        }

        await this.business_repo.save(newBusiness);
      }

      console.log("signup_new - end");
      return savedUser;
    }

                    
    async signin(firebaseId: string) {
        const user = await this.findFireUser(firebaseId);
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
            processedData[key] = this.sharedService.convertStringToDateObject(processedData[key]);
            console.log("after convert: ", processedData[key]);
          }
        }
    
        return processedData;
    }


    findFireUser(firebaseId: string) {
        return this.user_repo.find({ where: {firebaseId} })
    }


    async findByFirebaseId(firebaseId: string): Promise<User | null> {
        return this.user_repo.findOne({ where: { firebaseId } });
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
        const user = await this.user_repo.findOneBy({ firebaseId: userId });
        return user?.role?.includes(UserRole.ADMIN) || false;
    }


    // users.service.ts

    async updateExpiredTrials(): Promise<void> {
        const today = new Date();

        const expiredUsers = await this.user_repo.find({
            where: {
            payStatus: PayStatus.TRIAL,
            subscriptionEndDate: LessThan(today),
            },
        });

        for (const user of expiredUsers) {
            user.payStatus = PayStatus.PAYMENT_REQUIRED;
            await this.user_repo.save(user);
            console.log(`Updated user ${user.id} from TRIAL to PAYMENT_REQUIRED`);
        }
    }

    // async fetchCities(): Promise<CityDto[]> {
    //     return
    // }

    async fetchCities(): Promise<CityDto[]> {
        const citiesUrl = 'https://raw.githubusercontent.com/royts/israel-cities/master/israel-cities.json';
        try {
          const response = await axios.get(citiesUrl);
          return response.data; // Assumes it's already parsed as JSON array
        } catch (error) {
          console.error('Error fetching cities from GitHub:', error.message);
          throw new InternalServerErrorException('Failed to fetch cities data');
        }
      }



}