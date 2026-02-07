import { Module, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { User } from './user.entity';
import { Child } from './child.entity';
import { SharedModule } from 'src/shared/shared.module';
import { Delegation } from 'src/delegation/delegation.entity';
import { Business } from 'src/business/business.entity';
import { Agents } from 'src/delegation/agents.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Child, Business, Delegation, Agents]), SharedModule],
  controllers: [UsersController],
  providers: [
    UsersService, 
    AuthService, 
  ],
  exports: [UsersService],
})
export class UsersModule {}
