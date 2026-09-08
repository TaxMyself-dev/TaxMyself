import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ModalController } from '@ionic/angular';

import { ExpenseDataService } from './expense-data.service';
import { environment } from 'src/environments/environment';

describe('ExpenseDataService', () => {
  let service: ExpenseDataService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ModalController, useValue: {} },
      ],
    });
    service = TestBed.inject(ExpenseDataService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('loads the complete expense list by document date without VAT-period pagination', () => {
    service.getExpenseByUser('2025-01-01', '2025-12-31', '123456789').subscribe();

    const request = http.expectOne(req => req.url === `${environment.apiUrl}expenses/get_by_userID`);
    expect(request.request.params.get('startDate')).toBe('2025-01-01');
    expect(request.request.params.get('endDate')).toBe('2025-12-31');
    expect(request.request.params.get('businessNumber')).toBe('123456789');
    expect(request.request.params.has('pagination')).toBeFalse();
    request.flush([]);
  });

  it('loads a source asset by id for editing from the depreciation report', () => {
    service.getExpenseById(42).subscribe();

    const request = http.expectOne(`${environment.apiUrl}expenses/by-id/42`);
    expect(request.request.method).toBe('GET');
    request.flush({ id: 42 });
  });
});
