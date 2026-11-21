import { AnalysisJob } from './document-ai.types';
export interface CapacityProfile { provider: string; model: string; key: string; concurrency: number; rpm: number; itpm: number; otpm: number; pdfPageTokens: number; imageTokens: number; outputEstimate: number }
export interface CapacityState { at: number; requests: number; input: number; output: number; lastInteractiveTenant?: string; lastBulkTenant?: string; interactiveBurst?: number; blockedUntil?: number }
const positive = (name: string, env: NodeJS.ProcessEnv): number => {
  const raw = env[name];
  if (!raw || !/^\d+$/.test(raw) || !Number.isSafeInteger(+raw) || +raw < 1) throw new Error('Document AI capacity requires ' + name);
  return +raw;
};
/** Required numeric settings come from actual quotas/measurement, never invented tier defaults. */
export function capacityProfile(env: NodeJS.ProcessEnv = process.env): CapacityProfile {
  const provider = env.DOCUMENT_AI_PROVIDER || 'anthropic', model = env.DOCUMENT_AI_MODEL || 'claude-sonnet-4-6', key = env.DOCUMENT_AI_LIMIT_GROUP;
  if (!/^[a-z][a-z0-9_-]{0,31}$/.test(provider) || !/^[a-zA-Z0-9._:-]{1,100}$/.test(model) || !key || !/^[a-zA-Z0-9._:-]{1,120}$/.test(key)) throw new Error('Document AI provider/model/limit group missing or invalid');
  const result = { provider, model, key, concurrency: positive('DOCUMENT_AI_MAX_CONCURRENCY', env), rpm: positive('DOCUMENT_AI_RPM', env), itpm: positive('DOCUMENT_AI_ITPM', env), otpm: positive('DOCUMENT_AI_OTPM', env), pdfPageTokens: positive('DOCUMENT_AI_PDF_PAGE_TOKENS', env), imageTokens: positive('DOCUMENT_AI_IMAGE_TOKENS', env), outputEstimate: positive('DOCUMENT_AI_OUTPUT_ESTIMATE', env) };
  if (result.concurrency > 64) throw new Error('Document AI concurrency exceeds tested safety ceiling');
  return result;
}
export function refill(p: CapacityProfile, old: CapacityState | null, now: number): CapacityState {
  if (!old) return { at: now, requests: p.rpm, input: p.itpm, output: p.otpm };
  const minutes = Math.max(0, now - old.at) / 60000;
  return { ...old, at: Math.max(now,old.at), requests: Math.min(p.rpm, old.requests + minutes*p.rpm), input: Math.min(p.itpm, old.input + minutes*p.itpm), output: Math.min(p.otpm, old.output + minutes*p.otpm) };
}
export function reserve(p: CapacityProfile, state: CapacityState, input: number, output: number, now: number): { state: CapacityState; waitMs: number; oversized: boolean } {
  if (![input,output].every(n=>Number.isSafeInteger(n)&&n>0)) throw new Error('Invalid token estimate');
  const next = refill(p,state,now);
  if (input>p.itpm || output>p.otpm) return {state:next,waitMs:0,oversized:true};
  const waitMs=Math.ceil(Math.max(0,(next.blockedUntil||0)-now,(1-next.requests)*60000/p.rpm,(input-next.input)*60000/p.itpm,(output-next.output)*60000/p.otpm));
  if(waitMs) return {state:next,waitMs,oversized:false};
  return {state:{...next,requests:next.requests-1,input:next.input-input,output:next.output-output},waitMs:0,oversized:false};
}
const tenant=(j:AnalysisJob)=>j.owner+'\0'+j.business;
const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
/** Work-conserving 3:1 interactive/bulk lanes, round-robin across tenants in each lane. */
export function chooseJob(heads:AnalysisJob[],state:CapacityState):{job:AnalysisJob|null;state:CapacityState}{
  if(!heads.length)return {job:null,state};
  const interactive=heads.filter(j=>!!j.interactive),bulk=heads.filter(j=>!j.interactive);
  const lane=interactive.length&&(!bulk.length||(state.interactiveBurst||0)<3)?interactive:bulk;
  const last=lane===interactive?state.lastInteractiveTenant:state.lastBulkTenant;
  const sorted=[...lane].sort((a,b)=>compare(tenant(a),tenant(b))||a.sequence-b.sequence);
  const job=sorted.find(j=>!last||compare(tenant(j),last)>0)||sorted[0];
  return {job,state:lane===interactive?{...state,lastInteractiveTenant:tenant(job),interactiveBurst:(state.interactiveBurst||0)+1}:{...state,lastBulkTenant:tenant(job),interactiveBurst:0}};
}
