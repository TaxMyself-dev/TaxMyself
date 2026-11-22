import {
  AnalysisInput,
  AnalysisJob,
  AnalysisOutcome,
} from './document-ai.types';
import { CapacityProfile } from './document-ai.capacity';
export abstract class DocumentAnalysisExecutor {
  recordQueuedFailure?: (job: AnalysisJob, code: string) => Promise<void>;
  abstract prepareQueuedAnalysis(
    job: AnalysisJob,
    profile: CapacityProfile,
  ): Promise<AnalysisInput & { cached?: AnalysisOutcome }>;
  abstract completeQueuedAnalysis(
    job: AnalysisJob,
    outcome: AnalysisOutcome,
  ): Promise<Record<string, any>>;
  abstract recoverQueuedUploads(shouldContinue?: () => boolean): Promise<void>;
}
