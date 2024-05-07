import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import * as admin from 'firebase-admin';


@Injectable()
export class AuthService {

    public defaultApp: any;
    private readonly firebaseAuth: admin.auth.Auth;

    constructor(@InjectRepository(User) private user_repo: Repository<User>, 
                                        private userService: UsersService)
    {
        this.firebaseAuth = admin.auth();
    }

}

