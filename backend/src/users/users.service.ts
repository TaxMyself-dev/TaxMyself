import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Child } from './child.entity';
import { CreateUserDto } from './dtos/create-user.dto';
import { UserRole } from 'src/enum';
import { AuthService } from './auth.service';
import * as admin from 'firebase-admin';


@Injectable()
export class UsersService {

    public defaultApp: any;
    private readonly firebaseAuth: admin.auth.Auth;
    constructor
    (
        @InjectRepository(User) private user_repo: Repository<User>, 
        @InjectRepository(Child) private child_repo: Repository<Child>
    )
    {
        this.firebaseAuth = admin.auth();
    }
                              

    async signup(children: Child[], createUserDto: User, firebase_id: string) {
        createUserDto.firebaseId = firebase_id;
        console.log("CREATE USER DTO: ", createUserDto);
        children.forEach(child => {
            const newChild = this.child_repo.create(child);
            newChild.fatherID = firebase_id
            this.child_repo.save(newChild);
        });
        const user = this.user_repo.create(createUserDto);
        return this.user_repo.save(user);
    }


    async signin(token: string) {
        const firebaseId = await this.getFirbsaeIdByToken(token);
        const user = await this.findFireUser(firebaseId);
        return user;
    }


    findFireUser(firebaseId: string) {
        return this.user_repo.find({ where: {firebaseId} })
    }


    async getFirbsaeIdByToken(token: string): Promise<string> {
        let uid: string;
        if (token != null && token != '') {
            const firebaseUserData = await this.firebaseAuth.verifyIdToken(token);
            uid = firebaseUserData.uid;
            if (uid != null && uid != '') {
                console.log('User ID:', uid);
                return uid
            } else {
                throw new NotFoundException('Not a valid token');
            }
        }
    }


    async isAdmin(userId: string): Promise<boolean> {
        const user = await this.user_repo.findOneBy({firebaseId: userId});
        return user?.role === UserRole.ADMIN;
    }


    // async update(id: number, attrs: Partial<User>) {
    //     const user = await this.findOne(id);
    //     if (!user) {
    //         throw new NotFoundException('user not found');
    //     }
    //     Object.assign(user, attrs);
    //     return this.user_repo.save(user);
    // }


    // async remove(id: number) {
    //     const user = await this.findOne(id);
    //     if (!user) {
    //         throw new NotFoundException('user not found');
    //     }
    //     return this.user_repo.remove(user);
    // }


}
