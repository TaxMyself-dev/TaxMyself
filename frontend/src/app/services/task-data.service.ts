import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { environment } from 'src/environments/environment';
import {
  IAccountantTask,
  ICreateAccountantTask,
  IUpdateAccountantTask,
} from '../shared/interface';

export type TaskStatusFilter = 'open' | 'done' | 'all';

export interface TaskListQuery {
  status?: TaskStatusFilter;
  clientId?: string;
  businessNumber?: string;
  from?: string;
  to?: string;
}

@Injectable({ providedIn: 'root' })
export class TaskDataService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}accountant-tasks`;

  /** משדר אירוע שמודיע על שינוי ברשימת המשימות (יצירה / עדכון / מחיקה) */
  readonly tasksChanged$ = new Subject<void>();

  getTasks(query: TaskListQuery = {}): Observable<IAccountantTask[]> {
    let params = new HttpParams();
    if (query.status) params = params.set('status', query.status);
    if (query.clientId) params = params.set('clientId', query.clientId);
    if (query.businessNumber) params = params.set('businessNumber', query.businessNumber);
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);
    return this.http.get<IAccountantTask[]>(this.baseUrl, { params });
  }

  addTask(payload: ICreateAccountantTask): Observable<IAccountantTask> {
    return this.http.post<IAccountantTask>(this.baseUrl, payload);
  }

  updateTask(id: number, payload: IUpdateAccountantTask): Observable<IAccountantTask> {
    return this.http.patch<IAccountantTask>(`${this.baseUrl}/${id}`, payload);
  }

  deleteTask(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  /** הרצה ידנית של מחולל המשימות התקופתיות (אותה לוגיקה שהקרון מריץ פעם ביום) */
  runGeneration(): Observable<{ created: number; skipped: number }> {
    return this.http.post<{ created: number; skipped: number }>(`${this.baseUrl}/generate`, {});
  }
}
