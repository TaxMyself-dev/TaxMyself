import { TestBed } from "@angular/core/testing";
import { of } from "rxjs";
import { MessageService } from "primeng/api";
import { GmailSyncStateService } from "./gmail-sync-state.service";
import { IntegrationsService } from "./integrations.service";
describe("durable Gmail progress without an extra review screen", () => {
  let service: GmailSyncStateService, status: any;
  beforeEach(() => {
    status = {
      accounts: [],
      runs: [],
      minFromDate: "2025-01-01",
      maxToDate: "2026-11-19",
    };
    TestBed.configureTestingModule({
      providers: [
        {
          provide: IntegrationsService,
          useValue: { getGmailSyncStatus: () => of(status) },
        },
        { provide: MessageService, useValue: { add: () => {} } },
      ],
    });
    service = TestBed.inject(GmailSyncStateService);
  });
  afterEach(() => {
    status.runs = [];
    service.refresh();
  });
  it("continues polling processing after the mailbox pull completes", () => {
    status.runs = [{ pull_state: "COMPLETE", processing_state: "RUNNING" }];
    service.refresh();
    expect(service.isAnyRunning()).toBeTrue();
  });
  it("stops when remaining documents are simply awaiting normal approval", () => {
    status.runs = [
      {
        pull_state: "COMPLETE",
        processing_state: "COMPLETE",
        documents: { AWAITING_APPROVAL: 20 },
      },
    ];
    service.refresh();
    expect(service.isAnyRunning()).toBeFalse();
  });
  it("keeps pull retries distinct from completed processing", () => {
    status.runs = [{ pull_state: "RETRY", processing_state: "WAITING" }];
    service.refresh();
    expect(service.isAnyRunning()).toBeTrue();
    expect(service.status()?.runs?.[0].pull_state).toBe("RETRY");
  });
});
