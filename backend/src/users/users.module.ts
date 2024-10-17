import { Module, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { User } from './user.entity';
import { Child } from './child.entity';
import { Bill } from 'src/transactions/bill.entity';
import { Transactions } from 'src/transactions/transactions.entity';
import { SharedModule } from 'src/shared/shared.module';

@Module({
  imports: [TypeOrmModule.forFeature([User, Child]), SharedModule],
  controllers: [UsersController],
  providers: [
    UsersService, 
    AuthService, 
  ],
})
export class UsersModule {}
