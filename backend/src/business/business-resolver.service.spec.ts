import { BusinessProprietorRole } from '../enum';
import { Business } from './business.entity';
import { BusinessResolverService } from './business-resolver.service';
import { BusinessService } from './business.service';

describe('BusinessResolverService', () => {
  it('routes an implicit import to the explicitly assigned primary proprietor', async () => {
    const spouseBusiness = {
      id: 1,
      businessNumber: '222222222',
      proprietorRole: BusinessProprietorRole.SPOUSE,
    } as Business;
    const primaryBusiness = {
      id: 2,
      businessNumber: '111111111',
      proprietorRole: BusinessProprietorRole.PRIMARY,
    } as Business;
    const businessService = {
      getUserBusinesses: jest.fn().mockResolvedValue([
        spouseBusiness,
        primaryBusiness,
      ]),
    } as unknown as BusinessService;

    const service = new BusinessResolverService(businessService);

    await expect(service.resolveTargetBusiness('firebase-id')).resolves.toBe(
      primaryBusiness,
    );
  });
});
