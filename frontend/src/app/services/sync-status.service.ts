import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, filter, finalize, Observable, of, switchMap, take, takeWhile, tap, timer } from 'rxjs';
import { environment } from 'src/environments/environment';

export type SyncStatus = 'pending' | 'running' | 'completed' | 'completed_empty' | 'failed' | 'skipped';
export type SyncSkipReason = 'no_access' | 'cache_exists' | null;

export interface StageState {
  status: SyncStatus;
  rowsWritten: number;
  finishedAt: string | null;
  failureReason: string | null;
  skipReason: SyncSkipReason;
}

export interface SyncResponse {
  quickSync: StageState;
  fullSync: StageState;
}

export interface SyncCompleteOptions {
  /** Which stage terminal state triggers the reload. Defaults to 'quick'. */
  reloadOn?: 'quick' | 'full';
}

const TERMINAL_STATUSES: SyncStatus[] = ['completed', 'completed_empty', 'failed', 'skipped'];

@Injectable({ providedIn: 'root' })
export class SyncStatusService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}transactions/sync-status`;

  private isTerminalStatus(status: SyncStatus): boolean {
    return TERMINAL_STATUSES.includes(status);
  }

  private shouldReloadStage(stage: StageState): boolean {
    switch (stage.status) {
      case 'completed':       return true;
      case 'completed_empty': return true;
      case 'skipped':         return stage.skipReason === 'cache_exists';
      default:                return false;
    }
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
   * `maxAttempts` polls.
   *
   * Default: 5 s interval, 24 attempts = 2-minute ceiling.
   */
  private pollUntilDone(
    stage: 'quick' | 'full',
    intervalMs = 5000,
    maxAttempts = 24,
  ): Observable<SyncResponse | null> {
    let attemptNum = 0;
    return timer(0, intervalMs).pipe(
      tap(() => console.log(`[SyncStatus] Poll attempt ${++attemptNum} (watching: ${stage}Sync)`)),
      switchMap(() => this.getSyncResponse()),
      tap((res) => console.log('[SyncStatus] Response received:', res)),
      takeWhile((res) => {
        const stageStatus = res?.[`${stage}Sync`]?.status;
        const terminal = stageStatus != null && this.isTerminalStatus(stageStatus);
        const shouldContinue = !terminal && attemptNum < maxAttempts;
        if (!shouldContinue && !terminal) {
          console.log(`[SyncStatus] Polling timed out after ${attemptNum} attempts`);
        }
        return shouldContinue;
      }, /* inclusive= */ true),
    );
  }

  /**
   * Higher-level helper for pages that depend on cache-backed transaction data.
   *
   * Emits exactly ONCE with the full SyncResponse when the watched stage reaches a
   * terminal state that requires a data reload — then completes.
   *
   * If the watched stage is already terminal on the first poll (returning user whose
   * cache already exists), this observable completes silently without emitting, so
   * the page's initial data load is not repeated unnecessarily.
   *
   * @param options.reloadOn  Which stage to watch. Defaults to 'quick'.
   *
   * Usage in a page:
   *   this.syncStatusService.onSyncComplete()
   *     .pipe(takeUntilDestroyed(this.destroyRef))
   *     .subscribe(() => this.loadData());
   *
   *   this.syncStatusService.onSyncComplete({ reloadOn: 'full' })
   *     .pipe(takeUntilDestroyed(this.destroyRef))
   *     .subscribe(() => this.loadData());
   */
  onSyncComplete(options?: SyncCompleteOptions): Observable<SyncResponse> {
    const stage = options?.reloadOn ?? 'quick';
    const stageKey = `${stage}Sync` as 'quickSync' | 'fullSync';

    let seenRunning = false;
    let didEmitReload = false;

    return this.pollUntilDone(stage).pipe(
      tap((res) => {
        const stageState = res?.[stageKey];
        if (stageState?.status === 'running' && !seenRunning) {
          seenRunning = true;
          console.log(`[SyncStatus] Seen running state (${stageKey}) — watching for completion`);
        }
        if (stageState && this.isTerminalStatus(stageState.status)) {
          console.log(`[SyncStatus] Terminal state reached (${stageKey}): ${stageState.status}`, stageState);
          if (!seenRunning) {
            console.log(`[SyncStatus] ${stageKey} was already terminal on first poll — no reload needed`);
          } else if (!this.shouldReloadStage(stageState)) {
            console.log(`[SyncStatus] Terminal state reached but reload not required (status=${stageState.status}, skipReason=${stageState.skipReason})`);
          } else {
            console.log('[SyncStatus] Triggering data reload');
          }
        }
      }),
      filter((res): res is SyncResponse => {
        const stageState = res?.[stageKey];
        return (
          stageState != null &&
          seenRunning &&
          this.isTerminalStatus(stageState.status) &&
          this.shouldReloadStage(stageState)
        );
      }),
      take(1),
      tap(() => { didEmitReload = true; }),
      finalize(() => {
        if (!didEmitReload) {
          console.log('[SyncStatus] onSyncComplete completed without emitting a reload event');
        }
      }),
    );
  }
}
