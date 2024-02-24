import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthService } from 'src/users/auth.service';
import { Expense } from 'src/expenses/expenses.entity';
import { User } from 'src/users/user.entity';
import { UsersService } from 'src/users/users.service';
import { CloudController } from './cloud.controller';
import { CloudService } from './cloud.service';
import { Child } from 'src/users/child.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, User, Child])],
  controllers: [CloudController],
  providers: [
    CloudService,
    UsersService,
    AuthService,
  ],
})
export class CloudModule {}