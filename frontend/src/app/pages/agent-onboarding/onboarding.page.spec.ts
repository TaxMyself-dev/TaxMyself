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
  it("previews before saving and keeps the user text", async () => {
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
    await done;
    expect(page.proposal()?.id).toBe("p");
    expect(page.draft).toBe("אלעזר");
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
  it("renders the actual Hebrew conversation and memory panels", async () => {
    spyOn(OnboardingPage.prototype, "ngOnInit").and.resolveTo();
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.componentInstance.snapshot.set(snapshot);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector("main").getAttribute("dir")
    ).toBe("rtl");
    expect(fixture.nativeElement.querySelector("textarea")).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain("מה אני זוכר עליך");
    expect(fixture.nativeElement.textContent).toContain(
      "היסטוריית המידע ומחיקה מהזיכרון"
    );
  });
  it("locks the composer while a saved preview needs a decision", async () => {
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
    expect(fixture.nativeElement.textContent).toContain("עובד מהבית");
  });
  it("shows original narrative even if the summary omits a plan", async () => {
    spyOn(OnboardingPage.prototype, "ngOnInit").and.resolveTo();
    const fixture = TestBed.createComponent(OnboardingPage);
    fixture.componentInstance.snapshot.set({
      ...snapshot,
      story: { person: "", business: "", narrative: "אני מתכנן קורס דיגיטלי" },
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("הסיפור במילים שלך");
    expect(fixture.nativeElement.textContent).toContain(
      "אני מתכנן קורס דיגיטלי"
    );
  });
});
