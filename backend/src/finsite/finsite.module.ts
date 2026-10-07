import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { FinsiteService } from './finsite.service';
import { FinsiteController } from './finsite.controller';
import { Finsite } from './finsite.entity';
import { UsersModule } from '../users/users.module';


@Module({
  imports: [TypeOrmModule.forFeature([Finsite]), UsersModule],
  controllers: [FinsiteController],
  providers: [
    FinsiteService
  ],
})
export class FinsiteModule {}
