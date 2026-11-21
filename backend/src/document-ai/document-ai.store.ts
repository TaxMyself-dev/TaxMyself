import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { createHash, randomUUID } from 'crypto';
import { AnalysisJob, AnalysisPurpose, AnalysisState, AnalysisOutcome, analysisContext } from './document-ai.types';
import { CapacityProfile, CapacityState, chooseJob, refill, reserve } from './document-ai.capacity';

export interface EnqueueAnalysis {
  owner: string; business: string; actor?: string; purpose: AnalysisPurpose; source: string;
  hash: string; filename: string; mimeType: string; size: number; policy: string;
  context?: Record<string, any>; contextKey?: string; expiresAt?: Date;
  fileId?: string; folderId?: string;
}
@Injectable()
export class DocumentAiStore {
  constructor(readonly db: DataSource) {}
  async query(sql: string, params: any[] = [], manager?: EntityManager): Promise<any> {
    try { return await (manager || this.db).query(sql, params); }
    catch { throw new ServiceUnavailableException('Document analysis storage unavailable; reviewed schema is required'); }
  }
  async enqueue(input: EnqueueAnalysis, profile: CapacityProfile): Promise<AnalysisJob> {
    if (!input.owner || !input.business || !/^[a-f0-9]{64}$/.test(input.hash)) throw new Error('Invalid analysis identity');
    const identity = createHash('sha256').update(JSON.stringify([input.owner,input.business,input.hash,input.purpose,input.policy,input.contextKey || ''])).digest('hex');
    await this.query(`INSERT IGNORE INTO document_processing_jobs
      (id,identity_key,owner,business,actor,purpose,source,content_hash,filename,mime_type,size,provider,model,policy_version,capacity_key,interactive,context_json,state,drive_file_id,drive_folder_id,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [randomUUID(),identity,input.owner,input.business,input.actor||input.owner,input.purpose,input.source,input.hash,input.filename,input.mimeType,input.size,
        profile.provider,profile.model,input.policy,profile.key,['FORM_FILL','TRANSACTION_LINK'].includes(input.purpose)?1:0,JSON.stringify(input.context||{}),input.fileId?'READY':'UPLOADING',input.fileId||null,input.folderId||null,input.expiresAt||null]);
    const rows = await this.query('SELECT * FROM document_processing_jobs WHERE identity_key=? AND owner=? AND business=?',[identity,input.owner,input.business]);
    if (rows.length !== 1) throw new Error('Analysis identity reservation failed');
    return rows[0];
  }
  async get(id: string, owner: string, business: string, manager?: EntityManager): Promise<AnalysisJob> {
    const rows = await this.query('SELECT * FROM document_processing_jobs WHERE id=? AND owner=? AND business=?',[id,owner,business],manager);
    if (!rows[0]) throw new NotFoundException('Analysis not found');
    return rows[0];
  }
  async bindUpload(job: AnalysisJob, fileId: string, folderId: string): Promise<AnalysisJob> {
    const result=await this.query("UPDATE document_processing_jobs SET drive_file_id=?,drive_folder_id=?,state='READY' WHERE id=? AND owner=? AND business=? AND state='UPLOADING' AND drive_file_id IS NULL",[fileId,folderId,job.id,job.owner,job.business]);
    const current=await this.get(job.id,job.owner,job.business);
    if(result.affectedRows!==1 && current.drive_file_id!==fileId)throw new Error('Analysis upload already bound');
    return current;
  }
  private async lockedCapacity(p: CapacityProfile, manager: EntityManager): Promise<{ state: CapacityState; now: number }> {
    await this.query('INSERT IGNORE INTO document_ai_capacity (capacity_key,state_json) VALUES (?,NULL)',[p.key],manager);
    const [row]=await this.query('SELECT state_json FROM document_ai_capacity WHERE capacity_key=? FOR UPDATE',[p.key],manager);
    const [clock]=await this.query('SELECT ROUND(UNIX_TIMESTAMP(NOW(3))*1000) AS now_ms',[],manager);
    const now=Number(clock.now_ms);
    return {state:refill(p,row.state_json?analysisContext(row.state_json) as any:null,now),now};
  }
  private async saveCapacity(p:CapacityProfile,state:CapacityState,m:EntityManager){await this.query('UPDATE document_ai_capacity SET state_json=? WHERE capacity_key=?',[JSON.stringify(state),p.key],m);}
  async claimNext(p: CapacityProfile): Promise<AnalysisJob | null> {
    return this.db.transaction(async m=>{
      const {state}=await this.lockedCapacity(p,m);
      const [count]=await this.query("SELECT COUNT(*) AS active FROM document_processing_jobs WHERE capacity_key=? AND state IN ('PREPARING','IN_FLIGHT') AND lease_expires_at>UTC_TIMESTAMP(3)",[p.key],m);
      if(Number(count.active)>=p.concurrency)return null;
      // One head per tenant and lane: a large first tenant cannot hide competitors behind LIMIT.
      const heads=await this.query(`SELECT j.* FROM document_processing_jobs j JOIN
        (SELECT MIN(sequence) AS head FROM document_processing_jobs WHERE capacity_key=? AND provider=? AND state='READY'
         AND (next_at IS NULL OR next_at<=UTC_TIMESTAMP(3)) GROUP BY owner,business,interactive) h ON h.head=j.sequence
        ORDER BY j.sequence`,[p.key,p.provider],m);
      const selected=chooseJob(heads,state);if(!selected.job)return null;
      const token=randomUUID(),j=selected.job;
      const result=await this.query("UPDATE document_processing_jobs SET state='PREPARING',lease_token=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 3 MINUTE),attempts=attempts+1,started_at=COALESCE(started_at,UTC_TIMESTAMP(3)) WHERE id=? AND state='READY'",[token,j.id],m);
      if(result.affectedRows!==1)throw new Error('Analysis claim raced');
      await this.saveCapacity(p,selected.state,m);
      return {...j,state:'PREPARING',lease_token:token,attempts:j.attempts+1} as AnalysisJob;
    });
  }
  async admit(job: AnalysisJob,p:CapacityProfile,input:number,output:number):Promise<boolean>{
    if(job.provider!==p.provider||job.capacity_key!==p.key)throw new Error('Wrong provider capacity group');
    return this.db.transaction(async m=>{
      const {state,now}=await this.lockedCapacity(p,m);
      const current=await this.get(job.id,job.owner,job.business,m);
      if(current.lease_token!==job.lease_token||current.state!=='PREPARING'||current.attempt_id)throw new Error('Analysis admission fence changed');
      const decision=reserve(p,state,input,output,now);
      if(decision.oversized){await this.patch(job,{state:'BLOCKED',error_code:'TOKEN_ESTIMATE_EXCEEDS_CAPACITY',lease_token:null,lease_expires_at:null},m);return false;}
      if(decision.waitMs){await this.patch(job,{state:'READY',next_at:new Date(now+decision.waitMs),lease_token:null,lease_expires_at:null},m);await this.saveCapacity(p,decision.state,m);return false;}
      const attempt=randomUUID();
      await this.patch(job,{state:'IN_FLIGHT',attempt_id:attempt,reserved_input:input,reserved_output:output,ai_started_at:new Date(now)},m);
      await this.saveCapacity(p,decision.state,m);job.attempt_id=attempt;return true;
    });
  }
  async patch(job: AnalysisJob,values:Record<string,any>,m?:EntityManager):Promise<void>{
    const allowed=new Set(['state','error_code','lease_token','lease_expires_at','next_at','attempt_id','reserved_input','reserved_output','ai_started_at','claim_id','result_json','completion_json','finished_at','usage_json','timings_json']);
    const keys=Object.keys(values);if(!keys.length||keys.some(k=>!allowed.has(k)))throw new Error('Invalid analysis update');
    const result=await this.query('UPDATE document_processing_jobs SET '+keys.map(k=>k+'=?').join(',')+' WHERE id=? AND owner=? AND business=? AND lease_token=?', [...keys.map(k=>values[k]),job.id,job.owner,job.business,job.lease_token],m);
    if(result.affectedRows!==1)throw new Error('Analysis lease changed');
    Object.assign(job,values);
  }
  async saveResult(job:AnalysisJob,p:CapacityProfile,outcome:AnalysisOutcome,timings:Record<string,number>){
    await this.db.transaction(async m=>{
      const {state}=await this.lockedCapacity(p,m);
      const current=await this.get(job.id,job.owner,job.business,m);
      if(current.lease_token!==job.lease_token||current.state!=='IN_FLIGHT')throw new Error('Analysis result fence changed');
      const row:any=current;
      if(outcome.usage){
        // Reconcile reserved tokens, including overestimates and actual overruns. Missing usage earns no refund.
        state.input=Math.min(p.itpm,state.input+Number(row.reserved_input||0)-outcome.usage.input-(outcome.usage.cacheWrite||0));
        state.output=Math.min(p.otpm,state.output+Number(row.reserved_output||0)-outcome.usage.output);
      }
      await this.patch(job,{state:'RESULT_SAVED',result_json:JSON.stringify(outcome),usage_json:JSON.stringify(outcome.usage||null),timings_json:JSON.stringify(timings)},m);
      await this.saveCapacity(p,state,m);
    });
  }
  async rejectBeforeProcessing(job:AnalysisJob,p:CapacityProfile,code:string,seconds?:number){
    await this.db.transaction(async m=>{
      const {state,now}=await this.lockedCapacity(p,m);
      const current=await this.get(job.id,job.owner,job.business,m);
      if(current.lease_token!==job.lease_token||current.state!=='IN_FLIGHT')throw new Error('Rejected request lease changed');
      const row:any=current;
      state.requests=Math.min(p.rpm,state.requests+1);state.input=Math.min(p.itpm,state.input+Number(row.reserved_input||0));state.output=Math.min(p.otpm,state.output+Number(row.reserved_output||0));
      const retry=code==='RATE_LIMIT'&&Number.isFinite(seconds)&&seconds>=0;
      if(retry)state.blockedUntil=Math.max(state.blockedUntil||0,now+Math.max(1000,seconds*1000));
      await this.patch(job,{state:retry?'READY':'BLOCKED',attempt_id:null,error_code:code,next_at:retry?new Date(state.blockedUntil):null,lease_token:null,lease_expires_at:null},m);
      await this.saveCapacity(p,state,m);
    });
  }
  async claimCompletion():Promise<AnalysisJob|null>{
    return this.db.transaction(async m=>{
      const rows=await this.query("SELECT * FROM document_processing_jobs WHERE state='RESULT_SAVED' AND completion_attempts<5 AND (next_at IS NULL OR next_at<=UTC_TIMESTAMP(3)) ORDER BY sequence LIMIT 1 FOR UPDATE",[],m);
      if(!rows[0])return null;const job=rows[0] as AnalysisJob,token=randomUUID();
      const result=await this.query("UPDATE document_processing_jobs SET state='COMPLETING',completion_attempts=completion_attempts+1,lease_token=?,lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 3 MINUTE) WHERE id=? AND state='RESULT_SAVED'",[token,job.id],m);
      if(result.affectedRows!==1)throw new Error('Completion claim changed');
      return {...job,state:'COMPLETING',lease_token:token,completion_attempts:Number(job.completion_attempts||0)+1};
    });
  }
  async heartbeat(job:AnalysisJob){
    const result=await this.query('UPDATE document_processing_jobs SET lease_expires_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 3 MINUTE) WHERE id=? AND owner=? AND business=? AND lease_token=?',[job.id,job.owner,job.business,job.lease_token]);
    if(result.affectedRows!==1)throw new Error('Analysis heartbeat lost its lease');
  }
  async recoverExpired(){
    // Never replay a possibly paid attempt. Source files and saved outcomes are retained.
    await this.query("UPDATE document_processing_jobs SET state='UNKNOWN',error_code='AI_UNKNOWN_OUTCOME',lease_token=NULL,lease_expires_at=NULL WHERE state='IN_FLIGHT' AND lease_expires_at<UTC_TIMESTAMP(3)");
    await this.query("UPDATE document_processing_jobs SET state='READY',lease_token=NULL,lease_expires_at=NULL WHERE state='PREPARING' AND attempt_id IS NULL AND lease_expires_at<UTC_TIMESTAMP(3)");
    await this.query("UPDATE document_processing_jobs SET state='RESULT_SAVED',lease_token=NULL,lease_expires_at=NULL WHERE state='COMPLETING' AND lease_expires_at<UTC_TIMESTAMP(3)");
  }
}
