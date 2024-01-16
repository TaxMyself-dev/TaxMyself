import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { Supplier } from './supplier.entity';
import { SuppliersController } from './suppliers.controller';
import { SuppliersService } from './suppliers.service';
import { AuthService } from 'src/users/auth.service';
import { User } from 'src/users/user.entity';
import { UsersService } from 'src/users/users.service';

@Module({
  imports: [TypeOrmModule.forFeature([Supplier, User])],
  controllers: [SuppliersController],
  providers: [
    SuppliersService,
    UsersService,
    AuthService,
  ],
})
export class SuppliersModule {}
