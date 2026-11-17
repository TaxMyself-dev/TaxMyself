import { AgentClassificationService } from './agent-classification.service';
import { ApprovalStatus, RecognitionType } from 'src/enum';
import { DelegationScope } from 'src/delegation/delegation.entity';
import { FullTransactionCache } from 'src/transactions/full-transaction-cache.entity';
import { SlimTransaction } from 'src/transactions/slim-transaction.entity';
import { ClassificationType } from 'src/transactions/enums/classification-type.enum';

describe('agent one-time pending classification', () => {
  const owner = {
    firebaseId: 'owner',
    actorFirebaseId: 'owner',
    businessNumber: null,
    delegationScopes: [],
    isDelegatedAccess: false,
    isAdminImpersonation: false,
  };
  const query = {
    businessNumber: '123456789',
    externalTransactionId: 'tx',
    subCategoryId: 7,
  };
  function setup() {
    const cache: any = {
      userId: 'owner',
      externalTransactionId: 'tx',
      businessNumber: '123456789',
      billId: 2,
      amount: -118,
      currency: 'ILS',
      transactionDate: '2026-11-12',
      merchantName: 'Adobe',
      confirmed: false,
      isLocked: false,
      category: null,
      subCategory: null,
    };
    let slim: any = null;
    const domain: any = {
      assertAccessStillHolds: jest.fn(),
      resolveBusiness: jest.fn().mockResolvedValue({
        business: { businessNumber: '123456789', businessName: 'עסק' },
      }),
    };
    const account = {
      vatPercent: 66.67,
      taxPercent: 45,
      reductionPercent: 0,
      isEquipment: false,
      recognitionType: RecognitionType.RECOGNIZED,
    };
    const catalog: any = {
      getMergedExpenseCatalog: jest.fn().mockResolvedValue([
        {
          id: 7,
          name: 'תוכנה',
          category: { name: 'משרד' },
          account,
          accountId: 8,
          isPrivate: false,
          approvalStatus: ApprovalStatus.APPROVED,
        },
      ]),
    };
    const delegation: any = { scopes: [DelegationScope.EXPENSES_APPROVE] };
    const data: any = {
      getRepository: (entity: any) => ({
        findOne: async () =>
          entity === FullTransactionCache
            ? cache
            : entity === SlimTransaction
            ? slim
            : delegation,
      }),
    };
    const write = jest.fn();
    const processing: any = {
      classifyPendingForAgent: jest.fn(
        async (_u: any, _id: any, check: any) => {
          const action = await check(cache, slim);
          if (action.dto) {
            write(action.dto);
            slim = {
              ...action.dto,
              classificationType: ClassificationType.ONE_TIME,
              confirmed: false,
              isLocked: false,
            };
            Object.assign(cache, action.dto);
          }
          return action.result;
        },
      ),
    };
    const billing: any = { hasModuleAccess: jest.fn().mockResolvedValue(true) };
    const shared: any = {
      isRepresentedByAccountant: jest.fn().mockResolvedValue(false),
    };
    const service = new AgentClassificationService(
      domain,
      processing,
      catalog,
      { forUser: jest.fn() } as any,
      data,
      billing,
      shared,
    );
    return {
      service,
      cache,
      domain,
      catalog,
      account,
      delegation,
      write,
      processing,
      billing,
      setSlim: (value: any) => {
        slim = value;
      },
    };
  }
  it('prepares without writing; applies catalog values exactly once, never approves an expense', async () => {
    const f = setup();
    const proposal = await f.service.prepare(owner, query);
    expect(f.write).not.toHaveBeenCalled();
    const display = JSON.parse(JSON.parse(proposal.proposal).payload).display;
    expect(display).toMatchObject({
      merchant: 'Adobe',
      amount: -118,
      vatPercent: 66.67,
      taxPercent: 45,
    });
    expect(await f.service.apply(owner, proposal.proposal)).toMatchObject({
      status: 'classified',
      expenseApproved: false,
    });
    expect(f.write).toHaveBeenCalledWith(
      expect.objectContaining({
        subCategoryId: 7,
        vatPercent: 66.67,
        taxPercent: 45,
      }),
    );
    expect(await f.service.apply(owner, proposal.proposal)).toMatchObject({
      status: 'already_applied',
    });
    expect(f.write).toHaveBeenCalledTimes(1);
    f.cache.amount = -236;
    await expect(f.service.apply(owner, proposal.proposal)).rejects.toThrow(
      'CLASSIFICATION_STALE',
    );
    expect(f.write).toHaveBeenCalledTimes(1);
  });
  it('allows changing an existing classification while not transferred to an expense', async () => {
    const f = setup();
    f.cache.category = 'משרד';
    f.cache.subCategory = 'ציוד';
    f.setSlim({businessNumber: query.businessNumber, category: 'משרד', subCategory: 'ציוד', confirmed: false, isLocked: false});
    const p = await f.service.prepare(owner, query);
    expect(f.write).not.toHaveBeenCalled();
    await expect(f.service.apply(owner, p.proposal)).resolves.toMatchObject({status: 'classified', expenseApproved: false});
    expect(f.write).toHaveBeenCalledTimes(1);
  });
  it.each(['confirmed', 'isLocked'])(
    'refuses %s transactions',
    async (field) => {
      const f = setup();
      f.cache[field] = true;
      await expect(f.service.prepare(owner, query)).rejects.toThrow(
        'CLASSIFICATION_BLOCKED',
      );
      expect(f.write).not.toHaveBeenCalled();
    },
  );
  it.each([
    ['confirmed', 'transferred to an expense'],
    ['isLocked', 'locked by a submitted report'],
  ])(
    'explains a slim-only %s block despite a pending cache',
    async (field, reason) => {
      const f = setup();
      f.setSlim({ businessNumber: query.businessNumber, [field]: true });
      await expect(f.service.prepare(owner, query)).rejects.toThrow(reason);
      expect(f.write).not.toHaveBeenCalled();
    },
  );
  it('explains missing account and incoming payment separately', async () => {
    const f = setup();
    f.cache.billId = null;
    await expect(f.service.prepare(owner, query)).rejects.toThrow(
      'not linked to a bank/card account',
    );
    f.cache.billId = 2;
    f.cache.amount = 118;
    await expect(f.service.prepare(owner, query)).rejects.toThrow(
      'outgoing transactions only',
    );
    expect(f.write).not.toHaveBeenCalled();
  });
  it('rejects another business and an ineffective/unmapped category', async () => {
    const f = setup();
    f.cache.businessNumber = 'other';
    await expect(f.service.prepare(owner, query)).rejects.toThrow(
      'CLASSIFICATION_FORBIDDEN',
    );
    f.cache.businessNumber = query.businessNumber;
    f.catalog.getMergedExpenseCatalog.mockResolvedValue([]);
    await expect(f.service.prepare(owner, query)).rejects.toThrow(
      'CLASSIFICATION_CATEGORY_INVALID',
    );
  });
  it.each(['amount', 'category'])(
    'rejects a changed transaction (%s) after the card',
    async (field) => {
      const f = setup();
      const p = await f.service.prepare(owner, query);
      f.cache[field] = field === 'amount' ? -236 : 'changed';
      await expect(f.service.apply(owner, p.proposal)).rejects.toThrow(
        'CLASSIFICATION_STALE',
      );
      expect(f.write).not.toHaveBeenCalled();
    },
  );
  it('rejects changed catalog treatment after the card', async () => {
    const f = setup();
    const p = await f.service.prepare(owner, query);
    f.account.taxPercent = 100;
    await expect(f.service.apply(owner, p.proposal)).rejects.toThrow(
      'CLASSIFICATION_STALE',
    );
    expect(f.write).not.toHaveBeenCalled();
  });
  it('rejects tampering, another actor and expiry', async () => {
    const f = setup();
    const p = await f.service.prepare(owner, query);
    const envelope = JSON.parse(p.proposal);
    envelope.payload = envelope.payload.replace('Adobe', 'Other');
    await expect(
      f.service.apply(owner, JSON.stringify(envelope)),
    ).rejects.toThrow('CLASSIFICATION_STALE');
    await expect(
      f.service.apply({ ...owner, actorFirebaseId: 'other' }, p.proposal),
    ).rejects.toThrow('CLASSIFICATION_STALE');
    const clock = jest
      .spyOn(Date, 'now')
      .mockReturnValue(Date.now() + 31 * 60_000);
    try {
      await expect(f.service.apply(owner, p.proposal)).rejects.toThrow(
        'CLASSIFICATION_STALE',
      );
    } finally {
      clock.mockRestore();
    }
    expect(f.write).not.toHaveBeenCalled();
  });
  it('rechecks the current delegation scope at execution', async () => {
    const f = setup();
    const actor = {
      ...owner,
      actorFirebaseId: 'accountant',
      isDelegatedAccess: true,
    };
    const p = await f.service.prepare(actor, query);
    f.delegation.scopes = [];
    await expect(f.service.apply(actor, p.proposal)).rejects.toThrow(
      'CLASSIFICATION_FORBIDDEN',
    );
    expect(f.write).not.toHaveBeenCalled();
  });
  it('preserves represented-owner classification without expense approval', async () => {
    const f = setup();
    const p = await f.service.prepare(owner, query);
    expect(await f.service.apply(owner, p.proposal)).toMatchObject({
      expenseApproved: false,
    });
  });
  it('refuses a revoked identity and an unavailable banking module', async () => {
    const f = setup();
    f.domain.assertAccessStillHolds.mockRejectedValue(
      new Error('ACCESS_REVOKED'),
    );
    await expect(f.service.prepare(owner, query)).rejects.toThrow(
      'ACCESS_REVOKED',
    );
    f.domain.assertAccessStillHolds.mockResolvedValue(undefined);
    f.billing.hasModuleAccess.mockResolvedValue(false);
    await expect(f.service.prepare(owner, query)).rejects.toThrow(
      'CLASSIFICATION_FORBIDDEN',
    );
  });
});
