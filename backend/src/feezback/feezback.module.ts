import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FeezbackController } from './feezback.controller';
import { FeezbackService } from './feezback.service';
import { FeezbackJwtService } from './feezback-jwt.service';
import { Delegation } from '../delegation/delegation.entity';
import { User } from '../users/user.entity';

@Module({
  imports: [
    HttpModule.register({
      timeout: 90000, // 90 seconds timeout for all requests
      maxRedirects: 5,
    }),
    TypeOrmModule.forFeature([Delegation, User]),
  ],
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