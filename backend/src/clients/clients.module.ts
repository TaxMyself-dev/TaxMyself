import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { Clients } from './clients.entity';
import { Delegation } from 'src/delegation/delegation.entity';


@Module({
  imports: [TypeOrmModule.forFeature([Clients, Delegation])],
  controllers: [ClientsController],
  providers: [
    ClientsService,
  ],
})
export class ClientsModule {}