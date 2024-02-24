import { Module, MiddlewareConsumer } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { User } from './user.entity';
import { Child } from './child.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, Child])],
  controllers: [UsersController],
  providers: [
    UsersService, 
    AuthService, 
  ],
})
export class UsersModule {}
