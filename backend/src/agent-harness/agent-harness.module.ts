import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Delegation } from 'src/delegation/delegation.entity';
import { User } from 'src/users/user.entity';
import { AgentHarnessController } from './agent-harness.controller';
import { AgentHarnessService } from './agent-harness.service';

// The agent harness (backend/agent, KT-089): serves /api/agent/* through the
// agent package after FirebaseAuthGuard. Delegation and User are for the guard.
@Module({
  imports: [TypeOrmModule.forFeature([Delegation, User])],
  controllers: [AgentHarnessController],
  providers: [AgentHarnessService],
})
export class AgentHarnessModule {}
