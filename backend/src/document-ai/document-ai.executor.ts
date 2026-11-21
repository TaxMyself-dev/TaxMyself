import { AnalysisInput, AnalysisJob, AnalysisOutcome } from './document-ai.types';
import { CapacityProfile } from './document-ai.capacity';
export abstract class DocumentAnalysisExecutor {
  abstract prepareQueuedAnalysis(job:AnalysisJob,profile:CapacityProfile):Promise<AnalysisInput & {cached?:AnalysisOutcome}>;
  abstract completeQueuedAnalysis(job:AnalysisJob,outcome:AnalysisOutcome):Promise<Record<string,any>>;
  abstract recoverQueuedUploads():Promise<void>;
}
