import { Injectable } from '@nestjs/common';
import { DocumentProcessorService } from '../documents/document-processor.service';
import { AnalysisInput, AnalysisOutcome, AnalysisUsage, DocumentAiProvider, ProviderRejectedError } from './document-ai.types';
/** Transport adapter only. Queue state, fairness and recovery never depend on Anthropic SDK shapes. */
@Injectable()
export class AnthropicDocumentProvider implements DocumentAiProvider {
  readonly id='anthropic';
  constructor(private readonly processor:DocumentProcessorService){}
  async analyze(input:AnalysisInput,model:string):Promise<AnalysisOutcome>{
    if(!model.startsWith('claude-'))throw new ProviderRejectedError('PROVIDER_MODEL_MISMATCH');
    let usage:AnalysisUsage|undefined;
    try {
      const result=await this.processor.extract(input.bytes,input.mimeType,input.catalog,input.gmailPolicy,{model,onUsage:value=>{usage=value;},bounded:true});
      return {...result,usage};
    } catch(error:any) {
      const status=Number(error?.status);
      if(status===429){
        const raw=typeof error?.headers?.get==='function'?error.headers.get('retry-after'):error?.headers?.['retry-after'];
        const seconds=raw!==null&&raw!==undefined&&Number.isFinite(Number(raw))?Math.max(0,Number(raw)):undefined;
        throw new ProviderRejectedError('RATE_LIMIT',seconds);
      }
      if([400,401,403,404,413,422].includes(status))throw new ProviderRejectedError(status===413?'PROVIDER_INPUT_LIMIT':'PROVIDER_REJECTED_'+status);
      // Network errors/timeouts/5xx may have accepted a paid request: no transparent replay.
      throw new Error('AI_UNKNOWN_OUTCOME');
    }
  }
}
