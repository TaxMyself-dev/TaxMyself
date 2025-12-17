import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FeezbackController } from './feezback.controller';
import { FeezbackService } from './feezback.service';
import { FeezbackJwtService } from './feezback-jwt.service';

@Module({
  imports: [HttpModule],
  controllers: [FeezbackController],
  providers: [FeezbackService, FeezbackJwtService],
  exports: [FeezbackService],
})
export class FeezbackModule {}


// import { Module } from '@nestjs/common';
// import { TypeOrmModule } from '@nestjs/typeorm'
// import { FinsiteService } from './feezback.service';
// import { FinsiteController } from './feezback.controller';
// import { Finsite } from './feezback.entity';


// @Module({
//   imports: [TypeOrmModule.forFeature([Finsite])],
//   controllers: [FinsiteController],
//   providers: [
//     FinsiteService
//   ],
// })
// export class FinsiteModule {}