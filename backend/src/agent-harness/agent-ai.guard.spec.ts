import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AgentAiGuard } from './agent-ai.guard';
import { AgentDomainService } from './agent-domain.service';
import { AgentHarnessController } from './agent-harness.controller';
import { AutoClassificationController } from '../auto-classification/auto-classification.controller';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { ModuleName } from '../enum';

describe('AI module boundary', () => {
  it.each([AgentHarnessController, AutoClassificationController])('requires Firebase and AI access on %p', controller => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([FirebaseAuthGuard, AgentAiGuard]);
  });
  function setup() {
    const findOne = jest.fn().mockResolvedValue({role:['REGULAR']});
    const hasModuleAccess = jest.fn().mockResolvedValue(false);
    const domain = new AgentDomainService({} as any, {} as any, {} as any, {findOne} as any, {hasModuleAccess} as any);
    const guard = new AgentAiGuard(domain);
    const context:any = {switchToHttp:()=>({getRequest:()=>({user:{actorFirebaseId:'actor',firebaseId:'entitled-owner',role:['ADMIN']}})})};
    return {findOne,hasModuleAccess,domain,guard,context};
  }
  it('authorizes a regular actor with their own AI module, without owner or delegation overrides', async () => {
    const f=setup(); f.hasModuleAccess.mockResolvedValue(true);
    expect(await f.guard.canActivate(f.context)).toBe(true);
    expect(f.findOne).toHaveBeenCalledWith({where:{firebaseId:'actor'}});
    expect(f.hasModuleAccess).toHaveBeenCalledWith('actor',ModuleName.AI,false,false);
  });
  it('rejects an admin without AI and observes revocation on the next request', async () => {
    const f=setup();f.findOne.mockResolvedValue({role:['ADMIN']});
    await expect(f.guard.canActivate(f.context)).rejects.toThrow('AI module access');
    f.hasModuleAccess.mockResolvedValue(true);expect(await f.guard.canActivate(f.context)).toBe(true);
    f.hasModuleAccess.mockResolvedValue(false);await expect(f.guard.canActivate(f.context)).rejects.toThrow('AI module access');
  });
  it('fails closed for missing identity, missing actor and billing failure', async () => {
    const f=setup();
    await expect(f.domain.assertAiAccess({actorFirebaseId:''})).rejects.toThrow('AI module access');
    expect(f.findOne).not.toHaveBeenCalled();
    f.findOne.mockResolvedValue(null);await expect(f.guard.canActivate(f.context)).rejects.toThrow('AI module access');
    expect(f.hasModuleAccess).not.toHaveBeenCalled();
    f.findOne.mockResolvedValue({});f.hasModuleAccess.mockRejectedValue(new Error('billing unavailable'));
    await expect(f.guard.canActivate(f.context)).rejects.toThrow('billing unavailable');
  });
});
