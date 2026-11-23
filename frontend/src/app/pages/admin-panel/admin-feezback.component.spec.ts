import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { provideNoopAnimations } from "@angular/platform-browser/animations";
import {
  AdminFeezbackComponent,
  FeezbackAdminRow,
} from "./admin-feezback.component";

describe("Admin Feezback tab", () => {
  let component: AdminFeezbackComponent, http: HttpTestingController;
  const row = (id: string, extra = {}): FeezbackAdminRow => ({
    firebaseId: id,
    name: id,
    email: `${id}@example.com`,
    synthetic: false,
    hasOpenBanking: true,
    entitlement: {
      eligible: false,
      reason: "NO_ENTITLEMENT",
      plan: "basic",
      until: null,
      subscriptionStatus: "ACTIVE",
    },
    evidence: {
      primary: { consents: [], checkedAt: "2026-11-23", error: null },
      spouse: { consents: [], checkedAt: "2026-11-23", error: null },
    },
    primaryUnits: 1,
    spouseUnits: 0,
    expectedUnits: 1,
    stale: false,
    mismatch: true,
    pending: false,
    disconnectRequested: false,
    lastAction: null,
    lastError: null,
    ...extra,
  });
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AdminFeezbackComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideNoopAnimations(),
      ],
    });
    component = TestBed.createComponent(
      AdminFeezbackComponent
    ).componentInstance;
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it("loads saved-state pages only, then filters across all users", () => {
    component.reload();
    http
      .expectOne(
        (request) =>
          request.url.endsWith("/users") && request.params.get("page") === "0"
      )
      .flush({
        enabled: true,
        automatic: false,
        total: 101,
        rows: [row("first")],
      });
    http
      .expectOne((request) => request.params.get("page") === "1")
      .flush({
        enabled: true,
        automatic: false,
        total: 101,
        rows: [row("second")],
      });
    component.setSearch("second");
    expect(component.filtered().map((value) => value.firebaseId)).toEqual([
      "second",
    ]);
  });
  it("distinguishes unknown from zero and counts spouse independently", () => {
    component.rows.set([
      row("both", { primaryUnits: 1, spouseUnits: 1, expectedUnits: 2 }),
      row("unknown", { expectedUnits: null, spouseUnits: null }),
    ]);
    expect(component.units()).toBe(3);
    expect(component.unknown()).toBe(1);
    expect(component.unitsLabel(null)).toBe("לא ידוע");
    expect(component.unitsLabel(0)).toBe("0");
  });
  it("does not treat failed evidence as a successful disconnect", () => {
    expect(
      component.status(
        row("failed", {
          lastError: "DISCONNECTION_NOT_VERIFIED",
          disconnectRequested: true,
        })
      )
    ).toBe("ניתוק ממתין");
  });
  it("retains previous rows on a load error", () => {
    component.rows.set([row("previous")]);
    component.reload();
    http
      .expectOne((request) => request.url.endsWith("/users"))
      .flush({}, { status: 503, statusText: "Unavailable" });
    expect(component.rows()[0].firebaseId).toBe("previous");
    expect(component.error()).toBeTruthy();
  });
  it("queues a disconnect with explicit confirmation and refreshes the saved table", () => {
    const target = row("owner");
    component.confirmDisconnect.set(target);
    component.action(target, true);
    const request = http.expectOne((request) =>
      request.url.endsWith("/users/owner/disconnect")
    );
    expect(request.request.body).toEqual({ confirm: true });
    request.flush({ queued: true });
    http
      .expectOne((request) => request.url.endsWith("/users"))
      .flush({ enabled: true, automatic: false, total: 0, rows: [] });
    expect(component.confirmDisconnect()).toBeNull();
    expect(component.message()).toContain("ברקע");
  });
  it("compiles and renders the actual RTL table, including unknown states", () => {
    const fixture = TestBed.createComponent(AdminFeezbackComponent);
    fixture.detectChanges();
    http
      .expectOne((request) => request.url.endsWith("/users"))
      .flush({
        enabled: true,
        automatic: false,
        total: 1,
        rows: [row("owner", { expectedUnits: null })],
      });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("table").textContent).toContain(
      "לא ידוע"
    );
    expect(
      fixture.nativeElement.querySelector("section").getAttribute("dir")
    ).toBe("rtl");
    fixture.destroy();
  });
});
