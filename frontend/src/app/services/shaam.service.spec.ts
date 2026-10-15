import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { environment } from 'src/environments/environment';
import { ShaamService } from './shaam.service';

describe('ShaamService uniform-file flow', () => {
  let service: ShaamService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ShaamService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('prepares a business-scoped submission without sending file bytes', () => {
    service.prepareUniformFileSubmission(
      '222222226',
      '2026-01-01',
      '2026-12-31',
    ).subscribe();

    const request = http.expectOne(`${environment.apiUrl}shaam/uniform-file/submissions`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      businessNumber: '222222226',
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
    request.flush({});
  });

  it('transfers and polls only by internal submission id and business', () => {
    service.transferUniformFileSubmission('222222226', 91).subscribe();
    const transfer = http.expectOne(
      `${environment.apiUrl}shaam/uniform-file/submissions/91/transfer?businessNumber=222222226`,
    );
    expect(transfer.request.method).toBe('POST');
    expect(transfer.request.body).toEqual({});
    transfer.flush({});

    service.pollUniformFileSubmission('222222226', 91).subscribe();
    const poll = http.expectOne(
      `${environment.apiUrl}shaam/uniform-file/submissions/91/poll?businessNumber=222222226`,
    );
    expect(poll.request.method).toBe('POST');
    poll.flush({});
  });

  it('requests the isolated uniform-file OAuth product', () => {
    service.getAuthorizeUrl('222222226', 'UNIFORM_FILE').subscribe();

    const request = http.expectOne(`${environment.apiUrl}shaam/oauth/authorize`);
    expect(request.request.body).toEqual({
      businessNumber: '222222226',
      product: 'UNIFORM_FILE',
    });
    request.flush({ url: 'https://openapi.taxes.gov.il/authorize' });
  });
});
