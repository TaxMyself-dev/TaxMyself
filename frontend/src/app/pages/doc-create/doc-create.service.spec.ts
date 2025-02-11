import { TestBed } from '@angular/core/testing';

import { DocCreateService } from './doc-create.service';

describe('VatReportService', () => {
  let service: DocCreateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(DocCreateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
