import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface MonthlyFlowPoint {
  month: string;
  expenses: number;
  incomes: number;
}

export interface CategoryExpense {
  label: string | null;
  amount: number;
  percentage: number;
}

export interface FlowAnalysisResponse {
  totalExpenses: number;
  totalIncomes: number;
  monthlyFlow: MonthlyFlowPoint[];
  expensesByCategory: CategoryExpense[];
  hasMoreCategories: boolean;
}

@Injectable({ providedIn: 'root' })
export class FlowAnalysisService {
  private readonly url = `${environment.apiUrl}transactions/flow-analysis`;

  constructor(private http: HttpClient) {}

  getFlowAnalysis(
    startDate: string,
    endDate: string,
    billId: string,
    lineFilterType: 'all' | 'category' | 'subCategory' | 'merchant' | 'paymentMethod',
    lineFilterValue?: string,
  ): Observable<FlowAnalysisResponse> {
    let params = new HttpParams()
      .set('startDate', startDate)
      .set('endDate', endDate)
      .set('billId', billId)
      .set('lineFilterType', lineFilterType);

    if (lineFilterType !== 'all' && lineFilterValue) {
      params = params.set('lineFilterValue', lineFilterValue);
    }

    return this.http.get<FlowAnalysisResponse>(this.url, { params });
  }
}
