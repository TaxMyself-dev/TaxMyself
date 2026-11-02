import { FeezbackService } from './feezback.service';

describe('Permission refresh excludes inactive history', () => {
  afterEach(() => jest.restoreAllMocks());
  function fixture(status: string, role = 'primary', consentStatus = status, validUntil?: string) {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const target = (sub: string) => sub.endsWith('_sub_spouse') === (role === 'spouse');
    const api = {
      getUserConsents: jest.fn(async (sub: string) => ({consents: target(sub) ? [{resourceId:'c',consentStatus,validUntil}] : []})),
      getUserAccounts: jest.fn().mockResolvedValue({accounts:[{iban:'IL991234567',resourceId:'bank',consentId:'c',consentStatus:status}]}),
      getUserCards: jest.fn().mockResolvedValue({cards:[{maskedPan:'XXXX1234',resourceId:'card',consentId:'c',consentStatus:status}]}),
    };
    const sync = { upsertSourceConsents:jest.fn(), reconcileSourceConsents:jest.fn(), recordSourcesRefreshResult:jest.fn().mockResolvedValue(true) };
    const sources = {query:jest.fn(),find:jest.fn().mockResolvedValue([])};
    const owner = {firebaseId:'history-owner',hasOpenBanking:true};
    const service = new FeezbackService({} as any,{getTppId:()=> 'tpp'} as any,api as any,{} as any,{} as any,sync as any,
      {findOne:jest.fn().mockResolvedValue(owner)} as any,sources as any,{} as any,{} as any);
    return {service,api,sync,sources,log};
  }
  it.each(['expired','terminatedByTpp','revokedByPsu','rejected','suspendedByASPSP','received','unknown'])
  ('does not create bank/card sources for %s permissions', async status => {
    const {service,sources,log,sync}=fixture(status);
    const refresh = service.refreshUserSources('history-owner','permissions-refresh');
    if (status === 'unknown') await expect(refresh).rejects.toThrow();
    else await refresh;
    expect(sources.query).not.toHaveBeenCalled();
    expect(sync.upsertSourceConsents).not.toHaveBeenCalled();
    const output=log.mock.calls.flat().join('\n');
    expect(output).not.toContain('hasConsent=true');
    expect(output).not.toContain('verifiedConsent=true');
    expect(output).toContain('inactiveOrUnverified=1');
  });
  it('does not create sources when a valid consent has already expired by date',async()=>{
    const {service,sources}=fixture('valid','primary','valid','2000-01-01');
    await service.refreshUserSources('history-owner','permissions-refresh');
    expect(sources.query).not.toHaveBeenCalled();
  });
  it('does not create an invalid source even when its referenced consent is valid',async()=>{
    const {service,sources}=fixture('expired','primary','valid');
    await service.refreshUserSources('history-owner','permissions-refresh');
    expect(sources.query).not.toHaveBeenCalled();
  });
  it('does not clean existing data when a source has an unknown status under a valid consent',async()=>{
    const {service,sources,sync}=fixture('futureState','primary','valid');
    await expect(service.refreshUserSources('history-owner','permissions-refresh')).rejects.toThrow();
    expect(sources.query).not.toHaveBeenCalled();
    expect(sync.reconcileSourceConsents).not.toHaveBeenCalled();
  });
  it('applies the same exclusion to the spouse identity',async()=>{
    const {service,sources}=fixture('expired','spouse');
    await service.refreshUserSources('history-owner','permissions-refresh');
    expect(sources.query).not.toHaveBeenCalled();
  });
  it.each(['ConsentStatusChanged','permissions-refresh'])('does not infer direct cards on %s before readiness',async label=>{
    const {service,sources,sync}=fixture('valid');await service.refreshUserSources('history-owner',label);
    expect(sources.query.mock.calls.every(([,params])=>params[3]===null)).toBe(true);
    expect(sync.upsertSourceConsents).toHaveBeenCalledWith('history-owner',expect.arrayContaining([expect.objectContaining({type:'card',isDirect:null})]),expect.any(Date));
  });
  it('does not classify failed cards even when the consent is valid',async()=>{
    const {service,sources}=fixture('valid');await service.refreshUserSources('history-owner','UserDataIsAvailable',
      {sub:'history-owner_sub',consentId:'c',fetchedAccounts:[{resourceId:'card'}],failedToFetchAccounts:[{resourceId:'card'}]});
    expect(sources.query.mock.calls.every(([,params])=>params[3]===null)).toBe(true);
  });
  it('still adds active sources and reports verified consent, including direct cards',async()=>{
    const {service,sources,log}=fixture('valid');
    await service.refreshUserSources('history-owner','UserDataIsAvailable',{sub:'history-owner_sub',consentId:'c',fetchedAccounts:[{resourceId:'card'}],failedToFetchAccounts:[]});
    expect(sources.query).toHaveBeenCalledTimes(2);
    expect(sources.query.mock.calls.some(([,params])=>params[3]===true)).toBe(true);
    expect(log.mock.calls.flat().join('\n')).toContain('verifiedConsent=true');
  });
  it('adds only the active instruments in a mixed response while retaining negative reconciliation',async()=>{
    const {service,api,sources,sync}=fixture('valid');
    api.getUserAccounts.mockResolvedValue({accounts:[
      {iban:'IL998765432',resourceId:'old-bank',consentId:'c',consentStatus:'expired'},
      {iban:'IL991234567',resourceId:'bank',consentId:'c',consentStatus:'valid'},
    ]});
    api.getUserCards.mockResolvedValue({cards:[
      {maskedPan:'XXXX9988',resourceId:'old-card',consentId:'c',consentStatus:'expired'},
      {maskedPan:'XXXX1234',resourceId:'card',consentId:'c',consentStatus:'valid'},
    ]});
    await service.refreshUserSources('history-owner','permissions-refresh');
    expect(sources.query).toHaveBeenCalledTimes(2);
    expect(sources.query.mock.calls.map(([,params])=>params[1]).join(',')).not.toMatch(/8765432|9988/);
    expect(sync.reconcileSourceConsents).toHaveBeenCalledWith('history-owner','primary',[
      {type:'bank',sources:[expect.stringContaining('1234567')]},
      {type:'card',sources:['1234']},
    ],expect.any(Date),[]);
  });
});
