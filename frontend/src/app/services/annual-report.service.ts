import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, switchMap } from 'rxjs';
import { environment } from 'src/environments/environment';
import { IAnnualReport, IAnnualReportFile } from '../shared/interface';
import { FilesService } from './files.service';

@Injectable({ providedIn: 'root' })
export class AnnualReportService {
  private readonly http = inject(HttpClient);
  private readonly filesService = inject(FilesService);
  private readonly baseUrl = `${environment.apiUrl}annual-report`;

  getOrCreate(businessNumber: string, taxYear: number): Observable<IAnnualReport> {
    const params = new HttpParams()
      .set('businessNumber', businessNumber)
      .set('taxYear', taxYear.toString());
    return this.http.get<IAnnualReport>(this.baseUrl, { params });
  }

  saveAnswers(reportId: number, answers: Record<string, unknown>): Observable<IAnnualReport> {
    return this.http.patch<IAnnualReport>(`${this.baseUrl}/${reportId}/answers`, { answers });
  }

  /**
   * Two-stage upload: push the file to Firebase Storage (existing pipeline),
   * then attach the resulting path + name to the annual report on the backend.
   */
  uploadFile(
    reportId: number,
    businessNumber: string,
    file: File,
    category: string,
  ): Observable<IAnnualReportFile> {
    const fileName = file.name;
    return this.filesService.uploadFileViaFront(file, businessNumber).pipe(
      switchMap((res) => {
        const filePath = res?.metadata?.fullPath ?? '';
        return this.http.post<IAnnualReportFile>(
          `${this.baseUrl}/${reportId}/files`,
          { category, filePath, fileName },
        );
      }),
    );
  }

  removeFile(fileId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/files/${fileId}`);
  }

  finish(reportId: number): Observable<IAnnualReport> {
    return this.http.post<IAnnualReport>(`${this.baseUrl}/${reportId}/finish`, {});
  }

  setReported(reportId: number, reported: boolean): Observable<IAnnualReport> {
    return this.http.patch<IAnnualReport>(`${this.baseUrl}/${reportId}/reported`, { reported });
  }
}
