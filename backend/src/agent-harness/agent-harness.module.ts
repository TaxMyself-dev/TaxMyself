import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessModule } from 'src/business/business.module';
import { Delegation } from 'src/delegation/delegation.entity';
import { ExpensesModule } from 'src/expenses/expense.module';
import { User } from 'src/users/user.entity';
import { AgentDomainService } from './agent-domain.service';
import { AgentHarnessController } from './agent-harness.controller';
import { AgentHarnessService } from './agent-harness.service';

// The agent harness (backend/agent, KT-089): serves /api/agent/* through the
// agent package after FirebaseAuthGuard. Delegation and User are for the guard;
// the expenses and business modules back the agent's domain tools
// (AgentDomainService).
@Module({
  imports: [TypeOrmModule.forFeature([Delegation, User]), ExpensesModule, BusinessModule],
  controllers: [AgentHarnessController],
  providers: [AgentHarnessService, AgentDomainService],
})
export class AgentHarnessModule {}
