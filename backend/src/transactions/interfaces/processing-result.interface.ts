export interface ProcessingResult {
  totalReceived: number;
  savedToSlim: number;
  savedToCacheOnly: number;
  ruleMatched: number;
  skippedNoBillId: number;
  newlySavedToCache: number;
  alreadyExistingInCache: number;
  deduplicatedCount: number;
}
