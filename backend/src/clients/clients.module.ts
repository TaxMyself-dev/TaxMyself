import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm'
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';
import { Clients } from './clients.entity';
import { Delegation } from 'src/delegation/delegation.entity';
import { User } from 'src/users/user.entity';


@Module({
  imports: [TypeOrmModule.forFeature([Clients, Delegation, User])],
  controllers: [ClientsController],
  providers: [
    ClientsService,
  ],
  // The AI agent's listClients reads through the service (agent-harness).
  exports: [ClientsService],
})
export class ClientsModule {}