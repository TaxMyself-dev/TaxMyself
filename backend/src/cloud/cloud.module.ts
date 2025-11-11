import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthService } from '../users/auth.service';
import { Expense } from '../expenses/expenses.entity';
import { User } from '../users/user.entity';
import { UsersService } from '../users/users.service';
import { CloudController } from './cloud.controller';
import { CloudService } from './cloud.service';
import { Child } from '../users/child.entity';
import { SharedModule } from 'src/shared/shared.module';
import { Business } from 'src/business/business.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, User, Business, Child]), SharedModule],
  controllers: [CloudController],
  providers: [
    CloudService,
    UsersService,
    AuthService,
  ],
})
export class CloudModule {}