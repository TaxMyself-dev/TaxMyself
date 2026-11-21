import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { IntegrationsService } from './integrations.service';
import { environment } from 'src/environments/environment';

describe('Gmail connection requests', () => {
  let service: IntegrationsService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(IntegrationsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('creates a new connection without a mailbox identifier from the browser', () => {
    service.getGoogleConnectUrl().subscribe();
    const request = http.expectOne(`${environment.apiUrl}integrations/google/connect`);
    expect(request.request.params.keys()).toEqual([]);
    request.flush({ url: 'https://connect.composio.dev/link/test' });
  });
  it('reconnects only the explicitly selected local integration', () => {
    service.getGoogleConnectUrl(42).subscribe();
    const request = http.expectOne(`${environment.apiUrl}integrations/google/connect?integrationId=42`);
    expect(request.request.params.get('integrationId')).toBe('42');
    request.flush({ url: 'https://connect.composio.dev/link/test' });
  });
});


describe('Manual Gmail range request', () => {
  it('includes selected accounts and calendar dates', () => {
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting()]});
    const service=TestBed.inject(IntegrationsService);
    const http=TestBed.inject(HttpTestingController);
    service.importGmail([1,2],'2025-01-01','2026-11-21').subscribe();
    const request=http.expectOne(environment.apiUrl+'integrations/google/gmail/import');
    expect(request.request.body).toEqual({integrationIds:[1,2],fromDate:'2025-01-01',toDate:'2026-11-21'});
    request.flush({started:true});http.verify();
  });
});
