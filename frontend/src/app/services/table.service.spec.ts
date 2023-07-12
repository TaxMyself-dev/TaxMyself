import { TestBed } from '@angular/core/testing';

import { RowDataTableService } from './table.service';

describe('YourServiceNameService', () => {
  let service: RowDataTableService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RowDataTableService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
