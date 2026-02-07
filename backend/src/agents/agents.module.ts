import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import { Agents } from '../delegation/agents.entity';
import { Delegation } from '../delegation/delegation.entity';
import { User } from '../users/user.entity';
import { Business } from '../business/business.entity';
import { AgentAuthGuard } from '../guards/agent-auth.guard';
import { UsersModule } from '../users/users.module';
import { DocumentsModule } from '../documents/documents.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Agents, Delegation, User, Business]),
    UsersModule, // Import UsersModule to access UsersService
    DocumentsModule, // Import DocumentsModule to access DocumentsService
  ],
  controllers: [AgentsController],
  providers: [AgentsService, AgentAuthGuard],
  exports: [AgentAuthGuard, AgentsService],
})
export class AgentsModule {}

