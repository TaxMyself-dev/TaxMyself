import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoogleDriveController } from './google-drive.controller';
import { GoogleDriveService } from './google-drive.service';
import { User } from '../users/user.entity';
import { Delegation } from '../delegation/delegation.entity';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User, Delegation])],
  controllers: [GoogleDriveController],
  providers: [GoogleDriveService, FirebaseAuthGuard],
  exports: [GoogleDriveService],
})
export class GoogleDriveModule {}
