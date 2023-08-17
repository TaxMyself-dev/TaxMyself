import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dtos/create-user.dto';

@Injectable()
export class UsersService {
    constructor(@InjectRepository(User) private repo: Repository<User>) {}

    create(userDto: CreateUserDto): Promise<User> {
        const user = this.repo.create(userDto);
        return this.repo.save(user);
    }


    async findUser(firebaseId: string) {
        if (!firebaseId) {
            return null;
        }
        return this.repo.findOneBy({firebaseId});
    }

    findOne(index: number) {
        if (!index) {
            return null;
        }
        return this.repo.findOneBy({index});
    }

    find(email: string) {
        return this.repo.find({ where: {email} })
    }

    findFireUser(firebaseId: string) {
        return this.repo.find({ where: {firebaseId} })
    }

    async update(id: number, attrs: Partial<User>) {
        const user = await this.findOne(id);
        if (!user) {
            throw new NotFoundException('user not found');
        }
        Object.assign(user, attrs);
        return this.repo.save(user);
    }

    async remove(id: number) {
        const user = await this.findOne(id);
        if (!user) {
            throw new NotFoundException('user not found');
        }
        return this.repo.remove(user);
    }


}
