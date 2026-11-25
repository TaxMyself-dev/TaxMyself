import { emailRunIssueLines,emailRunPullLabel,emailSyncErrorMessage } from './email-sync-messages';
import { GmailDurableRun } from './integrations.service';
const run=(values:Partial<GmailDurableRun>={}):GmailDurableRun=>({id:'r',integrationId:17,businessNumber:'b',scan_state:'DONE',pull_state:'PARTIAL',processing_state:'ATTENTION',error_code:null,messages:{SCANNED:35},attachments:{BLOCKED:18,IMPORTED:9,DUPLICATE:3},documents:{},...values});
describe('mail result messages',()=>{
 it('describes completed scanning with retained source problems rather than a stopped pull',()=>{
  expect(emailRunPullLabel(run())).toContain('הסריקה הסתיימה');
  expect(emailSyncErrorMessage(null,run())).not.toContain('נעצרה');
 });
 it('does not hide connection or configuration failures behind partial results',()=>{
  expect(emailSyncErrorMessage('EMAIL_RECONNECT_REQUIRED',run())).toContain('לחבר מחדש');
  expect(emailSyncErrorMessage(null,run({scan_state:'PAGING',error_code:'EMAIL_CONFIGURATION'}))).toContain('תקלה בהגדרת החיבור');
 });
 it('separates expected access/manual cases, pending retries and document processing',()=>{
  const lines=emailRunIssueLines(run({issues:[{scope:'link',state:'BLOCKED',code:'LINK_ACCESS_REQUIRED',count:2},{scope:'link',state:'BLOCKED',code:'LINK_EXPIRED',count:5},{scope:'attachment',state:'RETRY',code:'ATTACHMENT_RETRY',count:1}],documents:{PASSWORD_REQUIRED:1,AWAITING_APPROVAL:1,DELETE_UNCONFIRMED:1}}));
  expect(lines.map(x=>x.count)).toEqual([2,5,1,1,1,1]);
  expect(lines[0].label).toContain('הרשאה');
  expect(lines[2].label).toContain('אוטומטי');
 });
 it('supports old summaries, unknown reasons, and genuine scan failures without claiming a cause',()=>{
  expect(emailRunIssueLines(run())[0].count).toBe(18);
  expect(emailRunIssueLines(run({issues:[{scope:'link',state:'BLOCKED',code:'NEW_UNKNOWN',count:1}]}))[0].label).toContain('אינה ידועה');
  expect(emailRunPullLabel(run({scan_state:'PAGING'}))).toBe('המשיכה לא הושלמה');
 });
 it('distinguishes processing attention after a successful pull',()=>{
  expect(emailSyncErrorMessage(null,run({pull_state:'COMPLETE'}))).toContain('בעיבוד');
 });
});
