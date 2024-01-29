import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dtos/create-user.dto';

@Injectable()
export class UsersService {

    private defaultApp: any;

    constructor(@InjectRepository(User) private user_repo: Repository<User>) {}

    create(userDto: CreateUserDto): Promise<User> {
        const user = this.user_repo.create(userDto);
        return this.user_repo.save(user);
    }

    async findUser(firebaseId: string) {
        if (!firebaseId) {
            return null;
        }
        return this.user_repo.findOneBy({firebaseId});
    }

    findOne(index: number) {
        if (!index) {
            return null;
        }
        return this.user_repo.findOneBy({index});
    }

    find(email: string) {
        return this.user_repo.find({ where: {email} })
    }

    findFireUser(firebaseId: string) {
        return this.user_repo.find({ where: {firebaseId} })
    }

    async update(id: number, attrs: Partial<User>) {
        const user = await this.findOne(id);
        if (!user) {
            throw new NotFoundException('user not found');
        }
        Object.assign(user, attrs);
        return this.user_repo.save(user);
    }

    async remove(id: number) {
        const user = await this.findOne(id);
        if (!user) {
            throw new NotFoundException('user not found');
        }
        return this.user_repo.remove(user);
    }

    async getUserIdFromToken(token: string): Promise<string> {
        console.log("Debug_777");
        let uid: string;
        if (token != null && token != '') {
            const firebaseUserData = await this.defaultApp.auth().verifyIdToken(token);
            uid = firebaseUserData.uid;
            if (uid != null && uid != '') {
                console.log('User ID:', uid);
                return uid
            } else {
                throw new NotFoundException('Not a valid token');
            }
        }
        console.log("uid is ", uid);
        
        //return uid;
    }


}
