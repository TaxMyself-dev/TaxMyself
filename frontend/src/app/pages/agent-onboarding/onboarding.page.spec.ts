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
    expect(page.welcome()).toBeTrue();
  });
  it("automatically commits each message without interrupting the conversation", async () => {
    page.snapshot.set(snapshot);
    page.selected = "111";
    page.draft = "אלעזר";
    await page.guided();
    const done = page.send();
    const req = http.expectOne(page.api + "api/agent-profile/propose");
    expect(req.request.body.message).toBe("אלעזר");
    expect(req.request.body.guidedField).toBe("preferred_name");
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
    expect(fixture.nativeElement.textContent).not.toContain("מה אני זוכר עליך");
    fixture.componentInstance.finish();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("textarea")).toBeNull();
    expect(fixture.nativeElement.textContent).toContain("מה אני זוכר עליך");
    expect(fixture.nativeElement.textContent).toContain(
      "היסטוריית המידע ומחיקה מהזיכרון"
    );
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
  it("shows original narrative even if the summary omits a plan", async () => {
    spyOn(OnboardingPage.prototype, "ngOnInit").and.resolveTo();
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.componentInstance.snapshot.set({
      ...snapshot,
      story: { person: "", business: "", narrative: "אני מתכנן קורס דיגיטלי" },
    });
    fixture.detectChanges();
    fixture.componentInstance.finish();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("הסיפור במילים שלך");
    expect(fixture.nativeElement.textContent).toContain(
      "אני מתכנן קורס דיגיטלי"
    );
  });
  it("retries the same proposal after a commit response fails", async () => {
    page.snapshot.set(snapshot); page.selected = "111"; page.draft = "סיפור";
    const sending = page.send();
    http.expectOne(page.api + "api/agent-profile/propose").flush({id:"retry",facts:[],clarification:null});
    await Promise.resolve();
    http.expectOne(page.api + "api/agent-profile/commit").flush({}, {status:503,statusText:"Unavailable"});
    await sending;
    expect(page.draft).toBe("סיפור");
    const retry = page.save();
    const request = http.expectOne(page.api + "api/agent-profile/commit");
    expect(request.request.body.proposalId).toBe("retry");
    http.expectNone(page.api + "api/agent-profile/propose");
    request.flush(snapshot); await retry;
    expect(page.draft).toBe("");
  });
  it("uses the assistant follow-up as the composer hint", () => {
    page.snapshot.set({...snapshot, turns:[{source_text:"שלום",assistant_text:"באיזה תחום העסק?"}]});
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
    fixture.nativeElement.style.cssText = "height:400px;width:800px;position:fixed;inset:0";
    fixture.componentInstance.snapshot.set({...snapshot, story:{person:"סיפור ארוך\n".repeat(150),business:"עסק"}});
    fixture.componentInstance.finish(); fixture.detectChanges();
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

});
