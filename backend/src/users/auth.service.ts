import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { CreateUserDto } from './dtos/create-user.dto';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';
import { NestMiddleware } from '@nestjs/common';
import { Request, Response } from 'express';
import * as firebase from 'firebase-admin';
import * as serviceAccount from '../auth/firebaseServiceAccount.json';
import { log } from 'console';
import * as admin from 'firebase-admin';

const firebase_params = {
    type: serviceAccount.type,
    projectId: serviceAccount.project_id,
    privateKeyId: serviceAccount.private_key_id,
    privateKey: serviceAccount.private_key,
    clientEmail: serviceAccount.client_email,
    clientId: serviceAccount.client_id,
    authUri: serviceAccount.auth_uri,
    tokenUri: serviceAccount.token_uri,
    authProviderX509CertUrl: serviceAccount.auth_provider_x509_cert_url,
    clientC509CertUrl: serviceAccount.client_x509_cert_url
}
const scrypt = promisify(_scrypt);

@Injectable()
export class AuthService {

    public defaultApp: any;

    private readonly firebaseAuth: admin.auth.Auth;

    constructor(@InjectRepository(User) private repo: Repository<User>, private userService: UsersService) {
        this.firebaseAuth = admin.auth();
          
        // this.defaultApp = firebase.initializeApp({
        //     credential: firebase.credential.cert(firebase_params),
        //     databaseURL: "https://fir-auth-bd895.firebaseio.com",
        //     storageBucket: "gs://taxmyself-5d8a0.appspot.com"
        // });
    }

    async signup(createUserDto: User, firebase_id: string) {
        console.log("debug_1");
        createUserDto.firebaseId = firebase_id;
        console.log(createUserDto);
        console.log("debug_2");
        const user = this.repo.create(createUserDto);
        return this.repo.save(createUserDto);
    }
    
    async signFire(token: string): Promise<string> {
        console.log("Debug");
        let uid: string;
        if (token != null && token != '') {
            //const firebaseUserData = await this.defaultApp.auth().verifyIdToken(token);
            const firebaseUserData = await this.firebaseAuth.verifyIdToken(token);
            uid = firebaseUserData.uid;
            if (uid != null && uid != '') {
                console.log('User ID:', uid);
                return uid
            } else {
                throw new NotFoundException('Not a valid token');
            }
        }
        console.log("uid is ", uid);
    }

    async getFirbsaeIdByToken(token: string): Promise<string> {
        console.log("getFirbsaeIdByToken - Start");
        let uid: string;
        if (token != null && token != '') {
            const firebaseUserData = await this.firebaseAuth.verifyIdToken(token);
            uid = firebaseUserData.uid;
            if (uid != null && uid != '') {
                console.log('User ID in getFirbsaeIdByToken :', uid);
                console.log("getFirbsaeIdByToken - End");
                return uid
            } else {
                throw new NotFoundException('Not a valid token');
            }
           
        }
    }



    // async signup(email: string, password: string) {
    //     // See if email is in use
    //     const users = await this.userService.find(email);
    //     if (users.length) {
    //         throw new BadRequestException('email in use')
    //     }
    //     // Hash the user password
    //     // Generate a salt  
    //     const salt = randomBytes(8).toString('hex');

    //     // Hash the salt and the password together 
    //     const hash = (await scrypt(password, salt, 32)) as Buffer;

    //     // Join the hashed result and the salt together 
    //     const result = salt + '.' + hash.toString('hex');

    //     // Create a nwe user and save it
    //     const user = await this.userService.create(email, result);

    //     // return the user 
    //     return user;
    // }

    async signin(email: string, password: string) {
        const [user] = await this.userService.find(email);
        if (!user) {
            throw new NotFoundException('user not found');
        }

        //const [salt, storedHash] = user.password.split('.');

        //const hash = (await scrypt(password, salt, 32)) as Buffer;

        //if (storedHash !== hash.toString('hex')) {
        //    throw new BadRequestException('bad password');
        //}

        return user;
    }

}

