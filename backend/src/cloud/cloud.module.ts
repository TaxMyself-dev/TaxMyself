import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { AuthService } from '../users/auth.service';
import { Expense } from '../expenses/expenses.entity';
import { User } from '../users/user.entity';
import { UsersModule } from '../users/users.module';
import { CloudController } from './cloud.controller';
import { CloudService } from './cloud.service';
import { Child } from '../users/child.entity';
import { SharedModule } from 'src/shared/shared.module';
import { Business } from 'src/business/business.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Expense, User, Business, Child]),
    SharedModule,
    UsersModule
  ],
  controllers: [CloudController],
  providers: [
    CloudService,
    AuthService,
  ],
})
export class CloudModule {}