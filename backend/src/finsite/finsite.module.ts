import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { FinsiteService } from './finsite.service';
import { FinsiteController } from './finsite.controller';
import { Finsite } from './finsite.entity';
import { UsersModule } from '../users/users.module';
import { User } from '../users/user.entity';
import { Delegation } from '../delegation/delegation.entity';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { AdminGuard } from '../guards/admin.guard';


@Module({
  imports: [TypeOrmModule.forFeature([Finsite, User, Delegation]), UsersModule],
  controllers: [FinsiteController],
  providers: [
    FinsiteService,
    FirebaseAuthGuard,
    AdminGuard,
  ],
})
export class FinsiteModule {}
