import { provideNoopAnimations } from "@angular/platform-browser/animations";
import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  provideHttpClientTesting,
  HttpTestingController,
} from "@angular/common/http/testing";
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from "@angular/router";
import { OnboardingPage } from "./onboarding.page";
describe("OnboardingPage", () => {
  let page: OnboardingPage;
  let http: HttpTestingController;
  const snapshot: any = {
    businessNumber: "111",
    version: { person: 0, business: 0 },
    invitation: "new",
    story: { person: "", business: "" },
    fields: [
      {
        key: "preferred_name",
        label: "שם",
        question: "איך לפנות?",
        state: "unasked",
        scope: "person",
      },
    ],
    facts: [],
    turns: [],
    missing: ["preferred_name"],
    opening: "ספר לי",
  };
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideNoopAnimations(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    page = TestBed.runInInjectionContext(() => new OnboardingPage());
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it("loads one business and offers first introduction", async () => {
    const done = page.ngOnInit();
    http
      .expectOne(page.api + "api/agent-profile/businesses")
      .flush([{ number: "111", name: "עסק" }]);
    await Promise.resolve();
    http
      .expectOne((r) => r.url === page.api + "api/agent-profile")
      .flush(snapshot);
    await done;
    expect(page.snapshot()?.opening).toBe("ספר לי");
  });
  it("automatically commits each message without interrupting the conversation", async () => {
    page.snapshot.set(snapshot);
    page.selected = "111";
    page.draft = "אלעזר";
    const done = page.send();
    const req = http.expectOne(page.api + "api/agent-profile/propose");
    expect(req.request.body.message).toBe("אלעזר");
    expect(req.request.body.guidedField).toBeUndefined();
    expect(req.request.body.skipField).toBeUndefined();
    req.flush({
      id: "p",
      facts: [{ statement: "אלעזר" }],
      clarification: null,
    });
    await Promise.resolve();
    http.expectOne(page.api + "api/agent-profile/commit").flush(snapshot);
    await done;
    expect(page.proposal()).toBeNull();
    expect(page.draft).toBe("");
    expect(page.summary()).toBeFalse();
  });
  it("keeps draft on version conflict", async () => {
    page.snapshot.set(snapshot);
    page.draft = "עדכון";
    const done = page.send();
    http
      .expectOne(page.api + "api/agent-profile/propose")
      .flush({}, { status: 409, statusText: "Conflict" });
    await done;
    expect(page.draft).toBe("עדכון");
    expect(page.error()).toContain("חלון אחר");
    expect(page.busy()).toBeFalse();
  });
  it("submits only a server-side proposal ID when confirming", async () => {
    page.selected = "111";
    page.proposal.set({ id: "p", facts: [], clarification: null });
    page.draft = "טקסט";
    const done = page.save();
    const req = http.expectOne(page.api + "api/agent-profile/commit");
    expect(req.request.body).toEqual({
      businessNumber: "111",
      proposalId: "p",
    });
    req.flush(snapshot);
    await done;
    expect(page.proposal()).toBeNull();
    expect(page.draft).toBe("");
  });
  it("shows the memory summary only when the user finishes", async () => {
    spyOn(OnboardingPage.prototype, "ngOnInit").and.resolveTo();
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.componentInstance.snapshot.set(snapshot);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector("main").getAttribute("dir")
    ).toBe("rtl");
    expect(fixture.nativeElement.querySelector("textarea")).not.toBeNull();
    expect(fixture.nativeElement.querySelector(".story")).toBeNull();
    const finishing = fixture.componentInstance.finish();
    const summary = http.expectOne(
      fixture.componentInstance.api + "api/agent-profile/summary"
    );
    expect(summary.request.body.version).toEqual(snapshot.version);
    summary.flush({ story: "קוראים לך שמואל, אתה עצמאי וגם שכיר." });
    await finishing;
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("textarea")).toBeNull();
    expect(fixture.nativeElement.querySelector(".story").textContent).toContain(
      "קוראים לך שמואל"
    );
    expect(fixture.nativeElement.textContent).toContain("פרטי הבסיס");
  });
  it("locks the composer while an uncertain commit can be retried", async () => {
    spyOn(OnboardingPage.prototype, "ngOnInit").and.resolveTo();
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.componentInstance.snapshot.set(snapshot);
    fixture.componentInstance.proposal.set({
      id: "p",
      facts: [
        {
          statement: "עובד מהבית",
          effectiveDate: null,
          precision: "unknown",
          change: "add",
        },
      ],
      clarification: null,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("textarea").disabled).toBeTrue();
    expect(fixture.nativeElement.textContent).toContain("ניסיון שמירה נוסף");
  });
  it("displays one narrative and grouped basics without source-log or timestamp duplication", async () => {
    spyOn(OnboardingPage.prototype, "ngOnInit").and.resolveTo();
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.componentInstance.snapshot.set({
      ...snapshot,
      story: {
        person: "ישן",
        business: "ישן",
        narrative: "נמסר במועד 2026-11-19: מקור",
      },
    });
    fixture.componentInstance.summaryText.set(
      "קוראים לך שמואל ואתה מתכנן קורס דיגיטלי."
    );
    fixture.componentInstance.summary.set(true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll(".story").length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain("נמסר במועד");
    expect(fixture.nativeElement.textContent).not.toContain(
      "הסיפור במילים שלך"
    );
    expect(
      fixture.nativeElement.querySelectorAll(".basic-groups > section").length
    ).toBe(2);
    expect(fixture.nativeElement.querySelector("dl").textContent).toContain(
      "שם"
    );
  });
  it("retries the same proposal after a commit response fails", async () => {
    page.snapshot.set(snapshot);
    page.selected = "111";
    page.draft = "סיפור";
    const sending = page.send();
    http
      .expectOne(page.api + "api/agent-profile/propose")
      .flush({ id: "retry", facts: [], clarification: null });
    await Promise.resolve();
    http
      .expectOne(page.api + "api/agent-profile/commit")
      .flush({}, { status: 503, statusText: "Unavailable" });
    await sending;
    expect(page.draft).toBe("סיפור");
    const retry = page.save();
    const request = http.expectOne(page.api + "api/agent-profile/commit");
    expect(request.request.body.proposalId).toBe("retry");
    http.expectNone(page.api + "api/agent-profile/propose");
    request.flush(snapshot);
    await retry;
    expect(page.draft).toBe("");
  });
  it("uses the assistant follow-up as the composer hint", () => {
    page.snapshot.set({
      ...snapshot,
      turns: [{ source_text: "שלום", assistant_text: "באיזה תחום העסק?" }],
    });
    expect(page.placeholder).toBe("באיזה תחום העסק?");
  });
  it("can scroll a long end summary in a bounded application viewport", async () => {
    spyOn(OnboardingPage.prototype, "ngOnInit").and.resolveTo();
    const fixture = TestBed.createComponent(OnboardingPage);
    // Ionic hides the test document until app hydration; this isolated fixture
    // does not bootstrap Ionic. Restore the document after measuring real layout.
    const bodyStyle = document.body.style.cssText;
    document.body.style.setProperty("display", "block", "important");
    document.body.appendChild(fixture.nativeElement);
    fixture.nativeElement.style.cssText =
      "height:400px;width:800px;position:fixed;inset:0";
    fixture.componentInstance.snapshot.set({
      ...snapshot,
      story: { person: "סיפור ארוך\n".repeat(150), business: "עסק" },
    });
    fixture.componentInstance.summaryText.set("סיפור ארוך\n".repeat(150));
    fixture.componentInstance.summary.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    const scroller = fixture.nativeElement.querySelector("main") as HTMLElement;
    try {
      for (const width of [800, 360]) {
        fixture.nativeElement.style.width = `${width}px`;
        expect(scroller.clientHeight).toBeGreaterThan(0);
        expect(scroller.scrollHeight).toBeGreaterThan(scroller.clientHeight);
        scroller.scrollTop = 200;
        expect(scroller.scrollTop).toBeGreaterThan(0);
      }
    } finally {
      fixture.destroy();
      document.body.style.cssText = bodyStyle;
    }
  });

  it("sends on Enter but leaves Shift+Enter and IME composition alone", () => {
    const send = spyOn(page, "send").and.resolveTo();
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
    });
    page.onComposerKeydown(enter);
    expect(enter.defaultPrevented).toBeTrue();
    expect(send).toHaveBeenCalledTimes(1);
    for (const options of [{ shiftKey: true }, { isComposing: true }]) {
      const event = new KeyboardEvent("keydown", {
        key: "Enter",
        cancelable: true,
        ...options,
      });
      page.onComposerKeydown(event);
      expect(event.defaultPrevented).toBeFalse();
    }
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("renders only Send as the composer action and explains optional guidance", () => {
    spyOn(OnboardingPage.prototype, "ngOnInit").and.resolveTo();
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.componentInstance.snapshot.set(snapshot);
    fixture.detectChanges();
    const form = fixture.nativeElement.querySelector("form");
    expect(form.textContent).toContain("שלח");
    expect(form.querySelectorAll("app-p-button").length).toBe(1);
    expect(fixture.nativeElement.textContent).not.toContain("דלג על");
    expect(fixture.nativeElement.textContent).not.toContain("כוון אותי");
    expect(fixture.nativeElement.textContent).toContain(
      "לא חייבים לענות עכשיו"
    );
  });
  it("keeps the conversation available when narrative generation fails", async () => {
    page.snapshot.set(snapshot);
    const done = page.finish();
    http
      .expectOne(page.api + "api/agent-profile/summary")
      .flush({}, { status: 503, statusText: "Unavailable" });
    await done;
    expect(page.summary()).toBeFalse();
    expect(page.snapshot()).toBe(snapshot);
    expect(page.busy()).toBeFalse();
    expect(page.error()).toBeTruthy();
  });

  it("shows basic answers in human-readable Hebrew", () => {
    expect(
      page.displayField({ ...snapshot.fields[0], value: "yes", state: "known" })
    ).toBe("כן");
    expect(
      page.displayField({
        ...snapshot.fields[0],
        value: null,
        state: "skipped",
      })
    ).toBe("נשאיר להמשך");
  });
});
