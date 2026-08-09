import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface ReferralInfo {
  accountantName: string;
}

export interface MyReferralCode {
  code: string;
  link: string;
}

@Injectable({ providedIn: 'root' })
export class ReferralService {
  constructor(private http: HttpClient) {}

  /** Public endpoint — no auth required. Used on /register (banner) and /referral-consent/:code. */
  getReferralInfo(code: string): Observable<ReferralInfo> {
    return this.http.get<ReferralInfo>(`${environment.apiUrl}referral/${code}/info`);
  }

  /** Authenticated, accountant-only. Lazily generates the code on first call. */
  getMyReferralCode(): Observable<MyReferralCode> {
    return this.http.get<MyReferralCode>(`${environment.apiUrl}delegations/my-referral-code`);
  }
}
