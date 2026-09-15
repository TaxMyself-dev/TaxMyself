import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from 'src/environments/environment';
import { BookkeepingCatalogService } from './bookkeeping-catalog.service';

describe('BookkeepingCatalogService', () => {
  let service: BookkeepingCatalogService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HttpClientTestingModule] });
    service = TestBed.inject(BookkeepingCatalogService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('requests the next SYSTEM code for the selected section', () => {
    service.getNextAdminBookingAccountCode(12).subscribe((result) => {
      expect(result).toEqual({ code: '60030' });
    });

    const request = http.expectOne(`${environment.apiUrl}admin/booking-accounts/sections/12/next-code`);
    expect(request.request.method).toBe('GET');
    request.flush({ code: '60030' });
  });
});
