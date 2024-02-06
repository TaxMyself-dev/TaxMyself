import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import * as admin from 'firebase-admin';
import { UserRole } from 'src/enum';


@Injectable()
export class AuthService {

    public defaultApp: any;
    private readonly firebaseAuth: admin.auth.Auth;

    constructor(@InjectRepository(User) private user_repo: Repository<User>, 
                                        private userService: UsersService)
    {
        this.firebaseAuth = admin.auth();
    }


    // async getFirbsaeIdByToken(token: string): Promise<string> {
    //     let uid: string;
    //     if (token != null && token != '') {
    //         const firebaseUserData = await this.firebaseAuth.verifyIdToken(token);
    //         uid = firebaseUserData.uid;
    //         if (uid != null && uid != '') {
    //             console.log('User ID:', uid);
    //             return uid
    //         } else {
    //             throw new NotFoundException('Not a valid token');
    //         }
    //     }
    // }


    // async isAdmin(userId: string): Promise<boolean> {
    //     const user = await this.user_repo.findOneBy({firebaseId: userId});
    //     return user?.role === UserRole.ADMIN;
    // }

}

