import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dtos/create-user.dto';
import { UserRole } from 'src/enum';

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


    async isAdmin(userId: string): Promise<boolean> {
        const user = await this.user_repo.findOneBy({firebaseId: userId});
        return user?.role === UserRole.ADMIN;
    }

}
