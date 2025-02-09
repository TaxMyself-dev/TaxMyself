import { Module, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { User } from './user.entity';
import { Child } from './child.entity';
import { SharedModule } from 'src/shared/shared.module';
import { Delegation } from 'src/delegation/delegation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Child, Delegation]), SharedModule],
  controllers: [UsersController],
  providers: [
    UsersService, 
    AuthService, 
  ],
})
export class UsersModule {}
