import { UsersController } from './users.controller';

describe('Banking login scheduling', () => {
  it('starts the banking pull before a slow or failed Drive diagnostic', async () => {
    let reject!: (error: Error)=>void;
    const users={getDriveProvisioningStatus:jest.fn(()=>new Promise((_resolve,no)=>{reject=no;}))};
    const banking={triggerFullSync:jest.fn().mockResolvedValue(undefined)};
    const controller=new UsersController(users as any,{} as any,banking as any,{} as any,{} as any);
    const result=(controller as any).triggerPostLoginSync('owner',{hasOpenBanking:true});
    expect(banking.triggerFullSync).toHaveBeenCalledWith('owner','login');
    reject(new Error('Drive unavailable'));
    await expect(result).rejects.toThrow('Drive unavailable');
    expect(banking.triggerFullSync).toHaveBeenCalledTimes(1);
  });
});
