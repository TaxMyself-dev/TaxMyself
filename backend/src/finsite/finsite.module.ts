import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { FinsiteService } from './finsite.service';
import { FinsiteController } from './finsite.controller';
import { Finsite } from './finsite.entity';


@Module({
  imports: [TypeOrmModule.forFeature([Finsite])],
  controllers: [FinsiteController],
  providers: [
    FinsiteService
  ],
})
export class FinsiteModule {}