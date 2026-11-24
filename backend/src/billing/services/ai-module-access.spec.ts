import { ModuleName } from '../../enum';
import { BillingAccessMode, SubscriptionStatus } from '../enums/billing.enums';
import { SubscriptionAccessService } from './subscription-access.service';
describe('AI subscription entitlement',()=>{
  const service=new SubscriptionAccessService();
  const subscription=(changes={})=>({status:SubscriptionStatus.ACTIVE,billingAccessMode:BillingAccessMode.STANDARD,...changes} as any);
  it('requires AI in an active plan and preserves other module grants',()=>{
    expect(service.resolveModulesAccess(subscription(),{modules:[ModuleName.OPEN_BANKING]} as any)).toEqual([ModuleName.OPEN_BANKING]);
    expect(service.resolveModulesAccess(subscription(),{modules:[ModuleName.AI]} as any)).toEqual([ModuleName.AI]);
  });
  it('inherits the existing trial and complimentary full-access policy',()=>{
    expect(service.resolveModulesAccess(subscription({status:SubscriptionStatus.TRIAL}))).toContain(ModuleName.AI);
    expect(service.resolveModulesAccess(subscription({billingAccessMode:BillingAccessMode.COMPLIMENTARY_FULL}))).toContain(ModuleName.AI);
  });
  it('revokes AI for expired trial, overdue payment and ended cancellation',()=>{
    for(const changes of [{status:SubscriptionStatus.TRIAL,trialEnd:new Date('2000-01-01')},{status:SubscriptionStatus.PAST_DUE},{status:SubscriptionStatus.CANCELED,endedAt:new Date('2000-01-01')}]){
      expect(service.resolveModulesAccess(subscription(changes),{modules:[ModuleName.AI]} as any)).not.toContain(ModuleName.AI);
    }
  });
});
