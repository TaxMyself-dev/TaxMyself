import { OauthStateService } from './oauth-state.service';
import { IntegrationProvider } from '../enums/integrations.enums';
describe('server-side connection business binding',()=>{
  it('stores selected business on an opaque single-use OAuth attempt and returns it only from storage',async()=>{
    let row:any;
    const repo:any={insert:jest.fn(async value=>{row={id:7,...value};}),delete:jest.fn(async()=>({affected:1})),findOne:jest.fn(async()=>row)};
    const service=new OauthStateService(repo);
    const state=await service.createState('owner',IntegrationProvider.GOOGLE,null,'123456789');
    expect(state).toMatch(/^[a-f0-9]{64}$/);expect(state).not.toContain('123456789');
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({businessNumber:'123456789',firebaseId:'owner'}));
    expect((await service.consumeState(state,IntegrationProvider.GOOGLE)).businessNumber).toBe('123456789');
    repo.delete.mockResolvedValue({affected:0});
    await expect(service.consumeState(state,IntegrationProvider.GOOGLE)).rejects.toThrow('expired');
  });
});
