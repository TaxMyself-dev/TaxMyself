import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AccessHandlerService } from 'src/app/services/access-handler.service';
import { GenericService } from 'src/app/services/generic.service';
import { Business } from 'src/app/shared/interface';
import { ReportsPage } from './reports.page';

describe('ReportsPage', () => {
  let fixture: ComponentFixture<ReportsPage>;
  let component: ReportsPage;
  const eligibleBusinesses = signal<Business[]>([]);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ReportsPage],
      providers: [
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        {
          provide: AccessHandlerService,
          useValue: { handleRouteAccess: () => ({ allowed: true }) },
        },
        {
          provide: GenericService,
          useValue: { vatReportEligibleBusinesses: eligibleBusinesses.asReadonly() },
        },
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsPage);
    component = fixture.componentInstance;
  });

  afterEach(() => eligibleBusinesses.set([]));

  it('hides the VAT report when there are no VAT-eligible businesses', () => {
    expect(component.itemsNavigate().some((item) => item.link === '/vat-report')).toBeFalse();
  });

  it('shows the VAT report when there is one VAT-eligible business', () => {
    eligibleBusinesses.set([{} as Business]);

    expect(component.itemsNavigate().some((item) => item.link === '/vat-report')).toBeTrue();
  });

  it('shows only one VAT entry when there are multiple eligible businesses', () => {
    eligibleBusinesses.set([{} as Business, {} as Business]);

    expect(component.itemsNavigate().filter((item) => item.link === '/vat-report').length).toBe(1);
  });
});
