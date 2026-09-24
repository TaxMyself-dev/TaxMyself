import { BadRequestException, ConflictException } from '@nestjs/common';
import { BusinessService } from './business.service';
import { BusinessType, VATReportingType } from 'src/enum';

describe('BusinessService VAT reporting invariant', () => {
  const makeService = (business: any) => {
    const save = jest.fn().mockImplementation(async (value: any) => value);
    const emptySelectQb = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const updateQb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        save,
        createQueryBuilder: jest.fn()
          .mockReturnValueOnce(emptySelectQb)
          .mockReturnValueOnce(emptySelectQb)
          .mockReturnValue(updateQb),
      }),
    } as any;
    const businessRepo = {
      findOne: jest.fn().mockResolvedValue(business),
      save,
      manager: {
        query: jest.fn().mockResolvedValue([]),
        transaction: jest.fn().mockImplementation(async (work: any) => work(manager)),
      },
    } as any;
    const usersService = {
      findByFirebaseId: jest.fn().mockResolvedValue({ isCompany: false }),
    } as any;
    const sharedService = {
      buildReportPeriodLabel: jest.fn().mockReturnValue('1-2/2026'),
    } as any;
    return {
      service: new BusinessService(businessRepo, usersService, sharedService),
      businessRepo,
    };
  };

  it('rejects a VAT-liable business with NOT_REQUIRED cadence', async () => {
    const { service } = makeService({
      id: 1,
      firebaseId: 'uid',
      businessType: BusinessType.LICENSED,
      vatReportingType: VATReportingType.MONTHLY_REPORT,
    });

    await expect(service.updateBusiness('uid', {
      id: 1,
      businessType: BusinessType.LICENSED,
      vatReportingType: VATReportingType.NOT_REQUIRED,
    } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('normalizes an exempt business to NOT_REQUIRED', async () => {
    const { service, businessRepo } = makeService({
      id: 1,
      firebaseId: 'uid',
      businessType: BusinessType.LICENSED,
      vatReportingType: VATReportingType.MONTHLY_REPORT,
    });

    await service.updateBusiness('uid', {
      id: 1,
      businessType: BusinessType.EXEMPT,
      vatReportingType: VATReportingType.MONTHLY_REPORT,
    } as any);

    expect(businessRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      businessType: BusinessType.EXEMPT,
      vatReportingType: VATReportingType.NOT_REQUIRED,
    }));
  });

  it('accepts monthly and bimonthly cadences for a VAT-liable business', async () => {
    const { service, businessRepo } = makeService({
      id: 1,
      firebaseId: 'uid',
      businessType: BusinessType.LICENSED,
      vatReportingType: VATReportingType.MONTHLY_REPORT,
    });

    await service.updateBusiness('uid', {
      id: 1,
      vatReportingType: VATReportingType.DUAL_MONTH_REPORT,
    } as any);

    expect(businessRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      vatReportingType: VATReportingType.DUAL_MONTH_REPORT,
    }));
    expect(businessRepo.manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('updates a business number when the business is identified by id', async () => {
    const business = {
      id: 1,
      firebaseId: 'uid',
      businessNumber: null,
      businessType: BusinessType.EXEMPT,
      vatReportingType: VATReportingType.NOT_REQUIRED,
    };
    const { service, businessRepo } = makeService(business);
    businessRepo.findOne
      .mockResolvedValueOnce(business)
      .mockResolvedValueOnce(null);

    await service.updateBusiness('uid', {
      id: 1,
      businessNumber: '123456789',
    });

    expect(businessRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 1,
      businessNumber: '123456789',
    }));
  });

  it('rejects a business number that belongs to another business', async () => {
    const business = {
      id: 1,
      firebaseId: 'uid',
      businessNumber: null,
      businessType: BusinessType.EXEMPT,
      vatReportingType: VATReportingType.NOT_REQUIRED,
    };
    const { service, businessRepo } = makeService(business);
    businessRepo.findOne
      .mockResolvedValueOnce(business)
      .mockResolvedValueOnce({ id: 2, businessNumber: '123456789' });

    await expect(service.updateBusiness('uid', {
      id: 1,
      businessNumber: '123456789',
    })).rejects.toBeInstanceOf(ConflictException);

    expect(businessRepo.save).not.toHaveBeenCalled();
  });

  it('rejects changing an existing business number when dependent records exist', async () => {
    const business = {
      id: 1,
      firebaseId: 'uid',
      businessNumber: '111111111',
      businessType: BusinessType.EXEMPT,
      vatReportingType: VATReportingType.NOT_REQUIRED,
    };
    const { service, businessRepo } = makeService(business);
    businessRepo.findOne
      .mockResolvedValueOnce(business)
      .mockResolvedValueOnce(null);
    businessRepo.manager.query
      .mockResolvedValueOnce([{ tableName: 'expense', columnName: 'businessNumber' }])
      .mockResolvedValueOnce([{ found: 1 }]);

    await expect(service.updateBusiness('uid', {
      id: 1,
      businessNumber: '222222222',
    })).rejects.toThrow('לא ניתן לשנות את מספר העסק משום שכבר קיימות רשומות המשויכות למספר הנוכחי');

    expect(businessRepo.save).not.toHaveBeenCalled();
  });

  it('allows changing an existing business number when it has no dependent records', async () => {
    const business = {
      id: 1,
      firebaseId: 'uid',
      businessNumber: '111111111',
      businessType: BusinessType.EXEMPT,
      vatReportingType: VATReportingType.NOT_REQUIRED,
    };
    const { service, businessRepo } = makeService(business);
    businessRepo.findOne
      .mockResolvedValueOnce(business)
      .mockResolvedValueOnce(null);
    businessRepo.manager.query.mockResolvedValueOnce([]);

    await service.updateBusiness('uid', {
      id: 1,
      businessNumber: '222222222',
    });

    expect(businessRepo.save).toHaveBeenCalledWith(expect.objectContaining({
      businessNumber: '222222222',
    }));
  });

  it('uses the ending month when translating a bimonthly late-claim period to monthly', () => {
    const { service } = makeService({
      id: 1,
      firebaseId: 'uid',
      businessType: BusinessType.LICENSED,
      vatReportingType: VATReportingType.DUAL_MONTH_REPORT,
    });

    expect((service as any).vatPeriodAnchor('3-4/2026', new Date('2026-01-01')))
      .toEqual(new Date(Date.UTC(2026, 3, 1)));
  });
});
