import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AgentDomainService } from '../agent-harness/agent-domain.service';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { UserRole } from '../enum';
import { OnboardingAdminGuard, OnboardingController } from './onboarding.controller';
describe('onboarding admin access',()=>{
  const user:any={actorFirebaseId:'actor',firebaseId:'owner'};
  it('requires both Firebase and admin checks on all profile endpoints',()=>{
    expect(Reflect.getMetadata(GUARDS_METADATA,OnboardingController)).toEqual([FirebaseAuthGuard,OnboardingAdminGuard]);
  });
  it('checks the persisted actor role, not the represented owner',async()=>{
    const findOne=jest.fn().mockResolvedValue({role:[UserRole.ADMIN]});
    const domain=new AgentDomainService({} as any,{} as any,{} as any,{findOne} as any);
    await domain.assertOnboardingAdmin(user);
    expect(findOne).toHaveBeenCalledWith({where:{firebaseId:'actor'}});
  });
  it('rejects regular users and absent identities',async()=>{
    const findOne=jest.fn().mockResolvedValue({role:[UserRole.REGULAR]});
    const domain=new AgentDomainService({} as any,{} as any,{} as any,{findOne} as any);
    await expect(domain.assertOnboardingAdmin(user)).rejects.toThrow('Admin access');
    await expect(domain.assertOnboardingAdmin({...user,actorFirebaseId:''})).rejects.toThrow('Admin access');
  });
});
