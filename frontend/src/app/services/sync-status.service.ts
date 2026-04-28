import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of, switchMap, takeWhile, tap, throwError, timer } from 'rxjs';
import { environment } from 'src/environments/environment';

export type TriggerSyncStatus = 'started' | 'running';

/** Frontend-facing lifecycle status. This is the only field that drives polling and reload decisions. */
export type ProcessStatus = 'running' | 'completed' | 'failed' | 'skipped';

/** Backend-facing outcome quality. Passed through for logging/debugging; must not drive polling logic. */
export type ResultStatus = 'none' | 'success' | 'partial_success' | 'failed';

export interface SourceResult {
  type: 'bank' | 'card';
  sourceId: string;
  status: 'not_synced' | 'success' | 'failed';
  transactionCount: number;
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
  quickSync: StageState;
  fullSync: StageState;
  sourceResults: SourceResult[];
}

const TERMINAL_STATUSES: ProcessStatus[] = ['completed', 'failed', 'skipped'];

@Injectable({ providedIn: 'root' })
export class SyncStatusService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}transactions/sync-status`;
  private readonly triggerUrl = `${environment.apiUrl}transactions/trigger-sync`;
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

  private isTerminalStatus(status: ProcessStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
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
   * nulls on HTTP error), completes when the watched stage is terminal OR after
   * `maxAttempts` polls (2-minute ceiling at 3 s interval).
   */
  private pollUntilDone(
    stage: 'quick' | 'full',
    intervalMs = 3000,
    maxAttempts = 40,
  ): Observable<SyncResponse | null> {
    let attemptNum = 0;
  
    return timer(0, intervalMs).pipe(
      tap(() =>
        console.log(`[SyncStatus] Poll attempt ${++attemptNum} (watching: ${stage}Sync)`),
      ),
      switchMap(() => this.getSyncResponse()),
      tap((res) => console.log('[SyncStatus] Response received:', res)),
      switchMap((res) => {
        const stageProcessStatus = res?.[`${stage}Sync`]?.processStatus;
        const terminal =
          stageProcessStatus != null && this.isTerminalStatus(stageProcessStatus);
  
        if (terminal) {
          return of(res);
        }
  
        if (attemptNum >= maxAttempts) {
          console.log(`[SyncStatus] Polling timed out after ${attemptNum} attempts`);
          return throwError(() => new Error(`Polling timed out for ${stage}Sync`));
        }
  
        return of(res);
      }),
      takeWhile((res) => {
        const stageProcessStatus = res?.[`${stage}Sync`]?.processStatus;
        return !(stageProcessStatus != null && this.isTerminalStatus(stageProcessStatus));
      }, true),
    );
  }

  /**
   * Single unified polling stream for a page or component.
   * Emits the watched stage's StageState on every poll (including null on HTTP error).
   * Completes automatically when the stage reaches a terminal processStatus.
   *
   * Use this as the single source of truth for both UI state updates and reload decisions.
   * Default stage: 'quick'.
   */
  getSyncStageStream(stage: 'quick' | 'full' = 'quick'): Observable<{ stageState: StageState | null; sourceResults: SourceResult[] }> {
    const stageKey = `${stage}Sync` as 'quickSync' | 'fullSync';
    return this.pollUntilDone(stage, 3000).pipe(
      map(res => ({
        stageState: res?.[stageKey] ?? null,
        sourceResults: res?.sourceResults ?? [],
      })),
    );
  }

}
