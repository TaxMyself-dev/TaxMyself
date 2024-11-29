import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { FinsiteService } from './finsite.service';
import { FinsiteController } from './finsite.controller';


@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [FinsiteController],
  providers: [
    FinsiteService
  ],
})
export class FinsiteModule {}