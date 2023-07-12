import { TestBed } from '@angular/core/testing';

import { VatReportService } from './vat-report.service';

describe('VatReportService', () => {
  let service: VatReportService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(VatReportService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
