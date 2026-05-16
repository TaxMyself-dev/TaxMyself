import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of, switchMap, takeWhile, tap, throwError, timer } from 'rxjs';
import { environment } from 'src/environments/environment';

export type TriggerSyncStatus = 'started' | 'running';

/**
 * Response shape from POST /transactions/post-consent-sync.
 *   completed — webhook-triggered sync already covered this consent flow; data is fresh, no polling needed.
 *   pending   — webhook hasn't fired or isn't done yet; frontend should poll /sync-status until terminal.
 */
export type PostConsentStatus = 'completed' | 'pending';

/** Frontend-facing lifecycle status. This is the only field that drives polling and reload decisions. */
export type ProcessStatus = 'running' | 'completed' | 'failed' | 'skipped';

/** Backend-facing outcome quality. Passed through for logging/debugging; must not drive polling logic. */
export type ResultStatus = 'none' | 'success' | 'partial_success' | 'failed';

export interface SourceResult {
  type: 'bank' | 'card';
  sourceId: string;
  status: 'not_synced' | 'success' | 'failed';
  transactionCount: number;
  consentId: string | null;
  error?: string;
}

export interface StageState {
  processStatus: ProcessStatus;
  resultStatus:  ResultStatus;
  rowsWritten: number;
  finishedAt: string | null;
  failureReason: string | null;
  skipReason: 'no_access' | 'cache_exists' | null;
}

export interface SyncResponse {
  fullSync: StageState;
  sourceResults: SourceResult[];
}

const TERMINAL_STATUSES: ProcessStatus[] = ['completed', 'failed', 'skipped'];

@Injectable({ providedIn: 'root' })
export class SyncStatusService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}transactions/sync-status`;
  private readonly triggerUrl = `${environment.apiUrl}transactions/trigger-sync`;
  private readonly postConsentSyncUrl = `${environment.apiUrl}transactions/post-consent-sync`;
  private readonly retryUrl = `${environment.apiUrl}transactions/retry-source`;

  /**
   * Calls POST /transactions/trigger-sync.
   * Returns { status: 'started' } if the sync was kicked off,
   * or { status: 'running' } if one is already in progress.
   * Throws on 403 (no Open Banking access) or other HTTP errors.
   */
  triggerSync(): Observable<{ status: TriggerSyncStatus }> {
    return this.http.post<{ status: TriggerSyncStatus }>(this.triggerUrl, {}).pipe(
      tap(res => console.log('[SyncStatus] triggerSync response:', res.status)),
      catchError(err => {
        console.error('[SyncStatus] triggerSync failed:', err?.status ?? err?.message ?? err);
        throw err;
      }),
    );
  }

  /**
   * Called by the my-account page when the user returns from the Feezback consent portal
   * (`?feezbackStatus=success`). Backend refreshes Source rows and reports whether a
   * webhook-triggered sync has already covered this consent flow:
   *   - 'completed' → fresh data already in DB; frontend can skip polling.
   *   - 'pending'   → webhook hasn't fired yet; frontend polls /sync-status.
   */
  triggerPostConsentSync(): Observable<{ status: PostConsentStatus }> {
    return this.http.post<{ status: PostConsentStatus }>(this.postConsentSyncUrl, {}).pipe(
      tap(res => console.log('[SyncStatus] triggerPostConsentSync response:', res.status)),
      catchError(err => {
        console.error('[SyncStatus] triggerPostConsentSync failed:', err?.status ?? err?.message ?? err);
        throw err;
      }),
    );
  }

  private isTerminalStatus(status: ProcessStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
  }

  /**
   * DEV-ONLY — seeds user_sync_state + user_source_sync_state with the given scenario
   * for the current user. Backed by `POST /transactions/dev/simulate-sync?scenario=...`,
   * which 403s in production.
   */
  simulateScenario(scenario: 'success' | 'allFailed' | 'partialSync' | 'partialConsent'): Observable<{ status: string; scenario: string }> {
    const url = `${environment.apiUrl}transactions/dev/simulate-sync?scenario=${scenario}`;
    return this.http.post<{ status: string; scenario: string }>(url, {}).pipe(
      tap(res => console.log('[SyncStatus] simulateScenario response:', res)),
      catchError(err => {
        console.error('[SyncStatus] simulateScenario failed:', err?.status ?? err?.message ?? err);
        throw err;
      }),
    );
  }

  /** DEV-ONLY — clears the simulated sync state for the current user. */
  resetSim(): Observable<{ status: string }> {
    const url = `${environment.apiUrl}transactions/dev/reset-sim`;
    return this.http.post<{ status: string }>(url, {}).pipe(
      tap(res => console.log('[SyncStatus] resetSim response:', res)),
      catchError(err => {
        console.error('[SyncStatus] resetSim failed:', err?.status ?? err?.message ?? err);
        throw err;
      }),
    );
  }

  retrySource(type: 'bank' | 'card', sourceId: string): Observable<SourceResult> {
    return this.http.post<SourceResult>(this.retryUrl, { type, sourceId }).pipe(
      tap(res => console.log('[SyncStatus] retrySource response:', res)),
      catchError(err => {
        console.error('[SyncStatus] retrySource failed:', err?.message ?? err);
        throw err;
      }),
    );
  }

  /** Single HTTP poll — returns null on network/HTTP error. */
  private getSyncResponse(): Observable<SyncResponse | null> {
    return this.http.get<SyncResponse>(this.url).pipe(
      catchError((err) => {
        console.log('[SyncStatus] HTTP error while fetching sync status:', err?.status ?? err?.message ?? err);
        return of(null);
      }),
    );
  }

  /**
   * Raw polling loop: polls every `intervalMs` ms, emits every response (including
   * nulls on HTTP error), completes when the sync is terminal OR after
   * `maxAttempts` polls (3-minute ceiling at 3 s interval). The 3 min budget
   * covers the typical Feezback `UserDataIsAvailable` webhook latency with
   * margin; on timeout the consumer's catchError flips the dialog to error.
   */
  private pollUntilDone(
    intervalMs = 3000,
    maxAttempts = 40,
  ): Observable<SyncResponse | null> {
    let attemptNum = 0;

    return timer(0, intervalMs).pipe(
      tap(() =>
        console.log(`[SyncStatus] Poll attempt ${++attemptNum}`),
      ),
      switchMap(() => this.getSyncResponse()),
      tap((res) => console.log('[SyncStatus] Response received:', res)),
      switchMap((res) => {
        // Only time out when we have NOT yet reached a terminal state.
        // Callers that need to poll past a stale terminal state (requireRunningFirst)
        // control stopping via their own takeWhile — if we killed the timer here on
        // terminal, those callers would be left with a dead source and a stuck UI.
        const stageProcessStatus = res?.fullSync?.processStatus;
        const terminal = stageProcessStatus != null && this.isTerminalStatus(stageProcessStatus);
        if (!terminal && attemptNum >= maxAttempts) {
          console.log(`[SyncStatus] Polling timed out after ${attemptNum} attempts`);
          return throwError(() => new Error(`Polling timed out`));
        }
        return of(res);
      }),
      // No takeWhile here: callers use their own takeWhile to stop the stream.
      // Removing it keeps the timer alive so callers that skip a stale terminal
      // state can continue polling until they see the status they expect.
    );
  }

  /**
   * Single unified polling stream for a page or component.
   * Emits the StageState on every poll (including null on HTTP error).
   * Completes automatically when the sync reaches a terminal processStatus.
   *
   * Use this as the single source of truth for both UI state updates and reload decisions.
   */
  getSyncStageStream(): Observable<{ stageState: StageState | null; sourceResults: SourceResult[] }> {
    return this.pollUntilDone(3000).pipe(
      map(res => ({
        stageState: res?.fullSync ?? null,
        sourceResults: res?.sourceResults ?? [],
      })),
    );
  }

}
