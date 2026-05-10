import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DemoDataController } from './demo-data.controller';
import { DemoDataService } from './demo-data.service';
import { UsersModule } from 'src/users/users.module';
import { Delegation } from 'src/delegation/delegation.entity';

@Module({
  // Delegation repo is required by FirebaseAuthGuard (which @UseGuards on the controller).
  imports: [TypeOrmModule.forFeature([Delegation]), UsersModule],
  controllers: [DemoDataController],
  providers: [DemoDataService],
})
export class DemoDataModule {}
