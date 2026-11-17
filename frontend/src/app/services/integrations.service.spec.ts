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
