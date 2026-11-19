import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  provideHttpClientTesting,
  HttpTestingController,
} from "@angular/common/http/testing";
import { provideRouter } from "@angular/router";
import { OnboardingInvitationComponent } from "./onboarding-invitation.component";
describe("normal application onboarding invitation", () => {
  const api = "http://localhost:3004/";
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
  });
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  function create(uid = "owner", session = "login-1", allowed = true) {
    const fixture = TestBed.createComponent(OnboardingInvitationComponent);
    fixture.componentRef.setInput("apiUrl", api);
    fixture.componentRef.setInput("ownerUid", uid);
    fixture.componentRef.setInput("sessionId", session);
    fixture.componentRef.setInput("allowPopup", allowed);
    fixture.detectChanges();
    return fixture;
  }
  function respond(rows: unknown[]) {
    TestBed.inject(HttpTestingController)
      .expectOne(api + "api/agent-profile/businesses")
      .flush(rows);
  }
  it("offers unfinished onboarding even when it has already started", async () => {
    const f = create();
    respond([
      { number: "111", invitation: "started", onboardingStatus: "in_progress" },
    ]);
    await f.whenStable();
    expect(f.componentInstance.visible()).toBeTrue();
    f.detectChanges();
    expect(f.componentInstance.onboardingPath).toBe(
      "/agent/onboarding"
    );
    f.destroy();
  });
  it("finds an incomplete second business when the first is complete", () => {
    const f = create();
    respond([
      { number: "111", invitation: "completed", onboardingStatus: "completed" },
      {
        number: "222",
        invitation: "completed",
        onboardingStatus: "in_progress",
      },
    ]);
    expect(f.componentInstance.visible()).toBeTrue();
    f.componentInstance.later();
    const req = TestBed.inject(HttpTestingController).expectOne(
      api + "api/agent-profile/defer"
    );
    expect(req.request.body.businessNumber).toBe("222");
    req.flush({ ok: true });
    f.destroy();
  });
  it("does not interrupt users who completed all businesses", () => {
    const f = create();
    respond([{ number: "111", onboardingStatus: "completed" }]);
    expect(f.componentInstance.visible()).toBeFalse();
    f.destroy();
  });
  it("shows at most once per owner login and offers it on the next login", () => {
    const f = create();
    respond([{ number: "111", onboardingStatus: "in_progress" }]);
    f.componentInstance.later();
    TestBed.inject(HttpTestingController)
      .expectOne(api + "api/agent-profile/defer")
      .flush({}, { status: 503, statusText: "Unavailable" });
    expect(f.componentInstance.visible()).toBeFalse();
    f.destroy();
    const second = create();
    TestBed.inject(HttpTestingController).expectNone(
      api + "api/agent-profile/businesses"
    );
    second.destroy();
    const next = create("owner", "login-2");
    respond([{ number: "111", onboardingStatus: "in_progress" }]);
    expect(next.componentInstance.visible()).toBeTrue();
    next.destroy();
  });
  it("waits until loading or a blocking overlay finishes", () => {
    const f = create("owner", "login-1", false);
    TestBed.inject(HttpTestingController).expectNone(
      api + "api/agent-profile/businesses"
    );
    f.componentRef.setInput("allowPopup", true);
    f.detectChanges();
    respond([{ number: "111", onboardingStatus: "not_started" }]);
    expect(f.componentInstance.visible()).toBeTrue();
    f.componentRef.setInput("allowPopup", false);
    f.detectChanges();
    expect(f.componentInstance.visible()).toBeFalse();
    f.destroy();
  });
  it("cancels stale requests when the signed-in owner changes", () => {
    const f = create("alice");
    const old = TestBed.inject(HttpTestingController).expectOne(
      api + "api/agent-profile/businesses"
    );
    f.componentRef.setInput("ownerUid", "bob");
    f.detectChanges();
    expect(old.cancelled).toBeTrue();
    respond([{ number: "222", onboardingStatus: "completed" }]);
    expect(f.componentInstance.visible()).toBeFalse();
    f.destroy();
  });
  it("does not block normal app use when onboarding is disabled", () => {
    const f = create();
    TestBed.inject(HttpTestingController)
      .expectOne(api + "api/agent-profile/businesses")
      .flush({}, { status: 503, statusText: "Unavailable" });
    expect(f.componentInstance.visible()).toBeFalse();
    f.destroy();
  });
  it("does not request private profile data without an owner", () => {
    const f = create("");
    expect(f.componentInstance.visible()).toBeFalse();
    TestBed.inject(HttpTestingController).expectNone(
      api + "api/agent-profile/businesses"
    );
    f.destroy();
  });
  it("waits for an existing banking or consent dialog to close", async () => {
    const blocker = document.createElement("div");
    blocker.className = "p-dialog-mask";
    document.body.appendChild(blocker);
    const f = create();
    respond([{ number: "111", onboardingStatus: "in_progress" }]);
    expect(f.componentInstance.visible()).toBeFalse();
    blocker.remove();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    f.detectChanges();
    expect(f.componentInstance.visible()).toBeTrue();
    f.destroy();
  });
});
