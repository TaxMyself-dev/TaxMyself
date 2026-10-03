import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { AdminPanelService, AdminFeezbackDateRangePullResult } from 'src/app/services/admin-panel.service';
import { FeezbackTransactionsDialogComponent } from './feezback-transactions-dialog.component';

describe('FeezbackTransactionsDialogComponent diagnostics', () => {
  let component: FeezbackTransactionsDialogComponent;

  const result: AdminFeezbackDateRangePullResult = {
    diagnosticId: 'diag-1',
    persistenceMode: 'diagnostic',
    status: 'success',
    request: {
      sentAt: '2026-10-02T10:32:35.476Z',
      provider: 'Feezback',
      sub: 'firebase-user_sub',
      userIdentifier: 'firebase-user_sub@test-tpp',
      bookingStatus: 'booked',
      dateFrom: '2026-07-01',
      dateTo: '2026-07-01',
      httpCalls: [],
      requests: [],
    },
    response: {
      receivedAt: '2026-10-02T10:32:36.476Z',
      durationMs: 1000,
      bank: null,
      card: null,
      errors: [],
    },
    sourceResults: [{
      type: 'card',
      sourceId: '4547',
      displayName: 'Card 4547',
      resourceId: 'card-resource',
      consentId: 'card-consent',
      sub: 'firebase-user_sub',
      status: 'success',
      apiVersion: 'v2',
      transactionCount: 0,
      httpCalls: [],
      extractedTransactions: [],
      normalizedTransactions: [],
      response: {},
      error: null,
    }],
    totalTransactions: 0,
    normalizedTransactions: [],
    suspectedDuplicates: [],
    databaseSaveResult: { saved: 0, skipped: 0 },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeezbackTransactionsDialogComponent],
      providers: [
        {
          provide: AdminPanelService,
          useValue: { getFeezbackSources: () => of({ accounts: null, cards: null }) },
        },
        {
          provide: MessageService,
          useValue: { add: jasmine.createSpy('add') },
        },
      ],
    }).compileComponents();

    component = TestBed.createComponent(FeezbackTransactionsDialogComponent).componentInstance;
  });

  it('prepares a support message with the provider identifiers and V2 source metadata', () => {
    component.prepareFeezbackSupportPackage(result);

    expect(component.supportMessage()).toContain('sub: firebase-user_sub');
    expect(component.supportMessage()).toContain('userIdentifier: firebase-user_sub@test-tpp');
    expect(component.supportMessage()).toContain('API version: v2');
    expect(component.supportMessage()).toContain('resourceId: card-resource');
  });

  it('redacts nested secrets and authorization strings from exported diagnostics', () => {
    const sanitized = (component as any).sanitizeForExport({
      authorization: 'Bearer secret-token',
      nested: { clientSecret: 'secret', curl: "--header 'Authorization: Bearer abc.def'" },
    });

    expect(JSON.stringify(sanitized)).not.toContain('secret-token');
    expect(JSON.stringify(sanitized)).not.toContain('abc.def');
    expect(JSON.stringify(sanitized)).toContain('<REDACTED>');
  });

  it('formats the complete diagnostic JSON for readable inspection while keeping it redacted', () => {
    const formatted = component.formattedDiagnosticJson({
      ...result,
      response: {
        ...result.response,
        bank: { authorization: 'Bearer secret-token' },
      },
    });

    expect(formatted).toContain('\n  "diagnosticId": "diag-1"');
    expect(formatted).toContain('<REDACTED>');
    expect(formatted).not.toContain('secret-token');
  });

  it('formats timestamps as unambiguous ISO 8601 UTC values', () => {
    expect(component.formatTimestamp('2026-10-02T10:32:35.476Z'))
      .toBe('2026-10-02T10:32:35.476Z');
  });
});
