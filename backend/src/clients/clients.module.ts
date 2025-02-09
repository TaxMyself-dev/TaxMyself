import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { Clients } from './clients.entity';


@Module({
  imports: [TypeOrmModule.forFeature([Clients])],
  controllers: [ClientsController],
  providers: [
    ClientsService,
  ],
})
export class ClientsModule {}