import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface InboundEmailAddress {
  businessNumber: string;
  businessName: string | null;
  domain: string;
  address: string | null;
  localPart: string | null;
  suggestedLocalPart: string;
  isLegacyGenerated: boolean;
}

@Injectable({ providedIn: 'root' })
export class InboundEmailService {
  private readonly http = inject(HttpClient);

  getMyAddresses(): Observable<InboundEmailAddress[]> {
    return this.http.get<InboundEmailAddress[]>(
      `${environment.apiUrl}inbound-email/me/addresses`,
    );
  }

  updateAddress(
    businessNumber: string,
    localPart: string,
  ): Observable<InboundEmailAddress> {
    return this.http.put<InboundEmailAddress>(
      `${environment.apiUrl}inbound-email/me/addresses/${encodeURIComponent(businessNumber)}`,
      { localPart },
    );
  }
}
