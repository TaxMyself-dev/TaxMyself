import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemoDataController } from './demo-data.controller';
import { DemoDataService } from './demo-data.service';
import { UsersModule } from 'src/users/users.module';
import { Delegation } from 'src/delegation/delegation.entity';
import { User } from 'src/users/user.entity';

@Module({
  // Delegation + User repos are required by FirebaseAuthGuard
  // (admin-bypass path needs the User repo to look up role).
  imports: [TypeOrmModule.forFeature([Delegation, User]), UsersModule],
  controllers: [DemoDataController],
  providers: [DemoDataService],
})
export class DemoDataModule {}
