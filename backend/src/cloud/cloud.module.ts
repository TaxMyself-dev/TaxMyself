import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthService } from 'src/users/auth.service';
import { Expense } from 'src/expenses/expenses.entity';
import { User } from 'src/users/user.entity';
import { UsersService } from 'src/users/users.service';
import { CloudController } from './cloud.controller';
import { CloudService } from './cloud.service';

@Module({
  imports: [TypeOrmModule.forFeature([Expense, User])],
  controllers: [CloudController],
  providers: [
    CloudService,
    UsersService,
    AuthService,
  ],
})
export class CloudModule {}