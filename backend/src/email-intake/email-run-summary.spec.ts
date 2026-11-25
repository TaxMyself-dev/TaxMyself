import { EmailIntakeStore } from './email-intake.store';
it('groups reasons without losing state totals or counting them twice; returns no source URLs',async()=>{
 const query=jest.fn(async(sql:string)=>{
  if(sql.includes("part_path<>'@message'"))return [
   {state:'BLOCKED',error_code:'LINK_ACCESS_REQUIRED',scope:'link',count:'2'},
   {state:'BLOCKED',error_code:'LINK_EXPIRED',scope:'link',count:'5'},
   {state:'RETRY',error_code:'ATTACHMENT_RETRY',scope:'attachment',count:'1'},
   {state:'IMPORTED',error_code:null,scope:'attachment',count:'9'}];
  if(sql.includes("part_path='@message'"))return [{state:'SCANNED',count:'35'},{state:'BLOCKED',error_code:'MESSAGE_RETRY',count:'1'}];
  return [{state:'PASSWORD_REQUIRED',count:'1'}];
 });
 const store=new EmailIntakeStore({query} as any);
 const result=await store.summary({id:'run'} as any);
 expect(result.attachments).toEqual({BLOCKED:7,RETRY:1,IMPORTED:9});
 expect(result.sourceCounts).toEqual({links:7,attachments:10});
 expect(result.issues).toEqual([
  {scope:'link',state:'BLOCKED',code:'LINK_ACCESS_REQUIRED',count:2},
  {scope:'link',state:'BLOCKED',code:'LINK_EXPIRED',count:5},
  {scope:'attachment',state:'RETRY',code:'ATTACHMENT_RETRY',count:1},
  {scope:'message',state:'BLOCKED',code:'MESSAGE_RETRY',count:1}]);
 expect(result.documents).toEqual({PASSWORD_REQUIRED:1});
 expect(query.mock.calls.every(([,args]:any)=>args[0]==='run')).toBe(true);
 expect(JSON.stringify(result)).not.toContain('source_metadata');
});
