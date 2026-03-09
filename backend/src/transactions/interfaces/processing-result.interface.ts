export interface ProcessingResult {
  totalReceived: number;
  savedToSlim: number;
  savedToCacheOnly: number;
  ruleMatched: number;
  skippedNoBillId: number;
  duplicatesInCache: number;
}
