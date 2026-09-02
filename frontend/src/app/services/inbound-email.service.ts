import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

export interface InboundEmailAddress {
  businessNumber: string;
  businessName: string | null;
  address: string;
}

@Injectable({ providedIn: 'root' })
export class InboundEmailService {
  private readonly http = inject(HttpClient);

  getMyAddresses(): Observable<InboundEmailAddress[]> {
    return this.http.get<InboundEmailAddress[]>(
      `${environment.apiUrl}inbound-email/me/addresses`,
    );
  }
}
