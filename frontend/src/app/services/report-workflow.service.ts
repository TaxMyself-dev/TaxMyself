import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from 'src/environments/environment';
import { IReportWorkflow } from '../shared/interface';
import { ReportWorkflowStatus } from '../shared/enums';

export interface ListWorkflowsQuery {
  status?: ReportWorkflowStatus;
  businessNumber?: string;
}

/**
 * Wrapper around the /report-workflows API. Used by:
 * - the client tasks page (list + confirm)
 * - the accountant משימות tab (set-reported actions on individual workflows)
 *
 * Also tracks the "pending" badge count via `pendingCount$` — a BehaviorSubject the
 * sidebar component subscribes to. Refreshed on demand by the consumers.
 */
@Injectable({ providedIn: 'root' })
export class ReportWorkflowService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}report-workflows`;

  private readonly pendingCountSubject = new BehaviorSubject<number>(0);
  readonly pendingCount$ = this.pendingCountSubject.asObservable();

  listMine(query: ListWorkflowsQuery = {}): Observable<IReportWorkflow[]> {
    let params = new HttpParams();
    if (query.status) params = params.set('status', query.status);
    if (query.businessNumber) params = params.set('businessNumber', query.businessNumber);
    return this.http.get<IReportWorkflow[]>(`${this.baseUrl}/me`, { params });
  }

  /** Convenience for the sidebar badge. Pulls only WAITING_FOR_CLIENT and updates pendingCount$. */
  refreshPendingCount(): Observable<IReportWorkflow[]> {
    return this.listMine({ status: ReportWorkflowStatus.WAITING_FOR_CLIENT }).pipe(
      tap((rows) => this.pendingCountSubject.next(rows.length)),
    );
  }

  /** Local-only update — useful after a confirm action so the badge updates immediately. */
  decrementPendingCount(): void {
    const current = this.pendingCountSubject.value;
    this.pendingCountSubject.next(Math.max(0, current - 1));
  }

  confirm(id: number): Observable<IReportWorkflow> {
    return this.http.post<IReportWorkflow>(`${this.baseUrl}/${id}/confirm`, {});
  }

  setReported(id: number, reported: boolean): Observable<IReportWorkflow> {
    return this.http.patch<IReportWorkflow>(`${this.baseUrl}/${id}/reported`, { reported });
  }
}
