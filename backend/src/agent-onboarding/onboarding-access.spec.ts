import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AgentDomainService } from '../agent-harness/agent-domain.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { ModuleName } from '../enum';
import { OnboardingAiGuard, OnboardingController } from './onboarding.controller';
describe('onboarding AI access',()=>{
  const user:any={actorFirebaseId:'actor',firebaseId:'owner'};
  it('protects every profile endpoint with Firebase and AI access',()=>{
    expect(Reflect.getMetadata(GUARDS_METADATA,OnboardingController)).toEqual([FirebaseAuthGuard,OnboardingAiGuard]);
  });
  it('allows an entitled regular actor and refuses revoked access',async()=>{
    const findOne=jest.fn().mockResolvedValue({role:['REGULAR']});
    const hasModuleAccess=jest.fn().mockResolvedValue(true);
    const domain=new AgentDomainService({} as any,{} as any,{} as any,{findOne} as any,{hasModuleAccess} as any);
    await domain.assertOnboardingAccess(user);
    expect(hasModuleAccess).toHaveBeenCalledWith('actor',ModuleName.AI,false,false);
    hasModuleAccess.mockResolvedValue(false);
    await expect(domain.assertOnboardingAccess(user)).rejects.toThrow('AI module access');
  });
});
