import {
  TestBed,
  fakeAsync,
  flushMicrotasks,
  tick,
} from "@angular/core/testing";
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
  function renderRows(rows: FeezbackAdminRow[]) {
    const fixture = TestBed.createComponent(AdminFeezbackComponent);
    fixture.detectChanges();
    http
      .expectOne((request) => request.url.endsWith("/users"))
      .flush({ enabled: true, automatic: false, total: rows.length, rows });
    fixture.detectChanges();
    return fixture;
  }
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
  it("shows immediate row feedback, queued progress and verified completion after polling", fakeAsync(() => {
    const fixture = renderRows([row("owner")]);
    const view = fixture.componentInstance;
    try {
      let check = Array.from(
        fixture.nativeElement.querySelectorAll("tbody button")
      ).find((button: HTMLButtonElement) =>
        button.textContent.includes("בדיקה מול פיזבק")
      ) as HTMLButtonElement;
      check.click();
      fixture.detectChanges();
      expect(check.textContent).toContain("שולח בקשת בדיקה");
      expect(check.getAttribute("aria-busy")).toBe("true");
      expect(
        fixture.nativeElement.querySelector(".row-feedback").textContent
      ).toContain("שולח");
      http
        .expectOne((request) => request.url.endsWith("/check"))
        .flush({ queued: true });
      http
        .expectOne((request) => request.url.endsWith("/users"))
        .flush({
          enabled: true,
          automatic: false,
          total: 1,
          rows: [row("owner", { pending: true })],
        });
      fixture.detectChanges();
      check = fixture.nativeElement.querySelector(
        'tbody button[aria-busy="true"]'
      );
      expect(check.textContent).toContain("ממתין לבדיקת פיזבק");
      expect(check.disabled).toBeTrue();
      expect(
        fixture.nativeElement.querySelector(".action-notice").textContent
      ).toContain("נוספה לתור");
      tick(5000);
      http
        .expectOne((request) => request.url.endsWith("/users"))
        .flush({
          enabled: true,
          automatic: false,
          total: 1,
          rows: [row("owner")],
        });
      fixture.detectChanges();
      expect(view.queuedActions()).toEqual({});
      const completedCheck = Array.from(
        fixture.nativeElement.querySelectorAll("tbody button")
      ).find((button: HTMLButtonElement) =>
        button.textContent.includes("בדיקה מול פיזבק")
      ) as HTMLButtonElement;
      expect(completedCheck.disabled).toBeFalse();
      expect(
        fixture.nativeElement.querySelector(".row-feedback").textContent
      ).toContain("הושלמה");
    } finally {
      fixture.destroy();
    }
  }));
  it("shows a request failure beside the affected row and releases the buttons", () => {
    component.action(row("owner"));
    http
      .expectOne((request) => request.url.endsWith("/check"))
      .flush({}, { status: 503, statusText: "Unavailable" });
    expect(component.rowFeedback()["owner"]).toContain("לא התקבלה");
    expect(component.error()).toContain("owner");
    expect(component.busy()).toBeNull();
    expect(component.queuedActions()).toEqual({});
  });
  it("does not call an accepted request a success when the provider check later fails", () => {
    component.action(row("owner"));
    http
      .expectOne((request) => request.url.endsWith("/check"))
      .flush({ queued: true });
    http
      .expectOne((request) => request.url.endsWith("/users"))
      .flush({
        enabled: true,
        automatic: false,
        total: 1,
        rows: [row("owner", { lastError: "CONSENT_CHECK_FAILED" })],
      });
    expect(component.error()).toContain("בדיקת הרשאות נכשלה");
    expect(component.message()).toBe("");
    expect(component.queuedActions()).toEqual({});
  });
  it("keeps queued progress until a fresh load when an older table request was already in flight", () => {
    component.reload();
    const oldLoad = http.expectOne((request) => request.url.endsWith("/users"));
    component.action(row("owner"));
    http
      .expectOne((request) => request.url.endsWith("/check"))
      .flush({ queued: true });
    oldLoad.flush({
      enabled: true,
      automatic: false,
      total: 1,
      rows: [row("owner")],
    });
    expect(component.queuedActions()["owner"]).toBe("check");
    http
      .expectOne((request) => request.url.endsWith("/users"))
      .flush({
        enabled: true,
        automatic: false,
        total: 1,
        rows: [row("owner", { pending: true })],
      });
    expect(component.rowFeedback()["owner"]).toContain("נוספה לתור");
  });
  it("shows pending disconnect feedback while the confirmation request is being submitted", () => {
    const target = row("owner");
    component.action(target, true);
    expect(component.disconnectLabel(target)).toContain("שולח בקשת ניתוק");
    http
      .expectOne((request) => request.url.endsWith("/disconnect"))
      .flush({ queued: true });
    http
      .expectOne((request) => request.url.endsWith("/users"))
      .flush({
        enabled: true,
        automatic: false,
        total: 1,
        rows: [row("owner", { pending: true, disconnectRequested: true })],
      });
    expect(component.disconnectLabel(target)).toBe("ניתוק בתהליך…");
    component.action(target, true);
    http.expectNone((request) => request.url.endsWith("/disconnect"));
  });
  it("requires explicit verified disconnection and zero identities before reporting disconnect success", () => {
    component.action(row("owner"), true);
    http
      .expectOne((request) => request.url.endsWith("/disconnect"))
      .flush({ queued: true });
    http
      .expectOne((request) => request.url.endsWith("/users"))
      .flush({
        enabled: true,
        automatic: false,
        total: 1,
        rows: [row("owner", { lastAction: "OBSERVED", expectedUnits: 1 })],
      });
    expect(component.error()).toContain("הניתוק טרם אומת");
    expect(component.message()).toBe("");
    component.action(row("owner"), true);
    http
      .expectOne((request) => request.url.endsWith("/disconnect"))
      .flush({ queued: true });
    http
      .expectOne((request) => request.url.endsWith("/users"))
      .flush({
        enabled: true,
        automatic: false,
        total: 1,
        rows: [row("owner", { lastAction: "DISCONNECTED", expectedUnits: 0 })],
      });
    expect(component.error()).toBe("");
    expect(component.message()).toContain("ניתוק כל ההרשאות אומת");
  });
  it("closes and reopens the consent dialog through its actual X button", fakeAsync(() => {
    const fixture = renderRows([row("owner")]);
    const view = fixture.componentInstance;
    try {
      view.selected.set(row("owner"));
      fixture.detectChanges();
      flushMicrotasks();
      fixture.detectChanges();
      const close = fixture.nativeElement.querySelector(
        "p-dialog button.p-dialog-close-button, p-dialog .p-dialog-close-button button"
      ) as HTMLButtonElement;
      expect(close)
        .withContext("PrimeNG close button must be present")
        .not.toBeNull();
      close.click();
      fixture.detectChanges();
      tick(200);
      fixture.detectChanges();
      expect(view.selected()).toBeNull();
      view.selected.set(row("owner"));
      fixture.detectChanges();
      flushMicrotasks();
      fixture.detectChanges();
      expect(
        fixture.nativeElement.querySelector("p-dialog .p-dialog")
      ).not.toBeNull();
    } finally {
      fixture.destroy();
    }
  }));
  it("closes the disconnect confirmation through X without submitting anything", fakeAsync(() => {
    const fixture = renderRows([row("owner")]);
    const view = fixture.componentInstance;
    try {
      view.confirmDisconnect.set(row("owner"));
      fixture.detectChanges();
      flushMicrotasks();
      fixture.detectChanges();
      const close = fixture.nativeElement.querySelector(
        "p-dialog button.p-dialog-close-button, p-dialog .p-dialog-close-button button"
      ) as HTMLButtonElement;
      expect(close).not.toBeNull();
      close.click();
      fixture.detectChanges();
      tick(200);
      expect(view.confirmDisconnect()).toBeNull();
      http.expectNone((request) => request.method === "POST");
    } finally {
      fixture.destroy();
    }
  }));
});
