import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';

import { GenericService } from 'src/app/services/generic.service';
import { environment } from 'src/environments/environment';
import { MannualExpenseService } from './mannual-expense.service';

describe('MannualExpenseService', () => {
  let service: MannualExpenseService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MannualExpenseService,
        {
          provide: GenericService,
          useValue: { businessSelectItems: signal([]) },
        },
      ],
    });

    service = TestBed.inject(MannualExpenseService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('waits for a business and reloads sub-categories when the business changes', fakeAsync(() => {
    service.$selectedCategory.set('רכוש קבוע (פחת)');
    tick();

    http.expectNone(req => req.url === `${environment.apiUrl}expenses/get-sub-categories`);

    service.$selectedBusinessNumber.set('304902133');
    tick();

    const firstSubCategories = http.expectOne(
      req => req.url === `${environment.apiUrl}expenses/get-sub-categories`,
    );
    expect(firstSubCategories.request.params.get('categoryName')).toBe('רכוש קבוע (פחת)');
    firstSubCategories.flush([{ id: 84, subCategoryName: 'מחשב' }]);
    http.expectOne(`${environment.apiUrl}expenses/get-suppliers-list`).flush([]);
    http.expectOne(req => req.url === `${environment.apiUrl}expenses/get-categories`).flush([]);
    tick();

    service.$selectedBusinessNumber.set('204245724');
    tick();

    const secondSubCategories = http.expectOne(
      req => req.url === `${environment.apiUrl}expenses/get-sub-categories`,
    );
    expect(secondSubCategories.request.params.get('categoryName')).toBe('רכוש קבוע (פחת)');
    secondSubCategories.flush([{ id: 85, subCategoryName: 'ריהוט' }]);
    http.expectOne(`${environment.apiUrl}expenses/get-suppliers-list`).flush([]);
    http.expectOne(req => req.url === `${environment.apiUrl}expenses/get-categories`).flush([]);
    tick();

    expect(service.$subCategoriesOptions()).toEqual([
      { name: 'ריהוט', value: 'ריהוט' },
    ]);
  }));
});
