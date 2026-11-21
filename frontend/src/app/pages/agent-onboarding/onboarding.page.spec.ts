import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { ActivatedRoute, convertToParamMap } from "@angular/router";
import { AngularFireAuth } from "@angular/fire/compat/auth";
import { of } from "rxjs";
import { OnboardingPage } from "./onboarding.page";
describe("onboarding shared chat", () => {
  let page: OnboardingPage, http: HttpTestingController;
  const snapshot: any = {
    businessNumber: "111",
    version: { person: 1, business: 1 },
    story: { person: "", business: "" },
    facts: [],
    fields: [],
    turns: [],
    missing: [],
    opening: "ספרו לי",
  };
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AngularFireAuth, useValue: { idToken: of("token") } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    page = TestBed.runInInjectionContext(() => new OnboardingPage());
    http = TestBed.inject(HttpTestingController);
    page.snapshot.set(snapshot);
    page.selected = "111";
  });
  afterEach(() => http.verify());
  it("sends text using the shared chat, with no extraction or commit request", async () => {
    const send = jasmine.createSpy().and.resolveTo();
    page.chat.set({ status: "ready", messages: [], sendMessage: send } as any);
    page.draft = "מה אתה כבר יודע עליי?";
    await page.send();
    expect(send).toHaveBeenCalledOnceWith({ text: "מה אתה כבר יודע עליי?" });
    expect(page.draft).toBe("");
  });
  it("requests a summary in the same conversation only when finishing", async () => {
    const send = jasmine.createSpy().and.resolveTo();
    page.chat.set({ status: "ready", messages: [], sendMessage: send } as any);
    await page.finish();
    expect(send.calls.mostRecent().args[0].text).toContain("סכם לי בסיפור");
    expect(page.summary()).toBeFalse();
  });
  it("Enter sends and Shift+Enter preserves a newline", () => {
    const send = spyOn(page, "send").and.resolveTo();
    const enter = new KeyboardEvent("keydown", {
      key: "Enter",
      cancelable: true,
    });
    page.onComposerKeydown(enter);
    expect(send).toHaveBeenCalledTimes(1);
    expect(enter.defaultPrevented).toBeTrue();
    page.onComposerKeydown(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }),
    );
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not submit while an answer is streaming", async () => {
    const send = jasmine.createSpy();
    page.chat.set({
      status: "streaming",
      messages: [],
      sendMessage: send,
    } as any);
    page.draft = "לא";
    await page.send();
    expect(send).not.toHaveBeenCalled();
    expect(page.draft).toBe("לא");
  });
  it("deletes an identified fact with the current version and invalidates the summary", async () => {
    page.summary.set(true);
    page.summaryText.set("סיפור ישן");
    const done = page.forget("fact-id");
    const request = http.expectOne(page.api + "api/agent-profile/forget");
    expect(request.request.body).toEqual({
      businessNumber: "111",
      factId: "fact-id",
      version: snapshot.version,
    });
    request.flush(snapshot);
    await done;
    expect(page.summaryText()).toBe("");
    expect(page.summary()).toBeFalse();
  });
});

describe("onboarding thinking state", () => {
  it("tracks submitted and streaming status reactively", () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AngularFireAuth, useValue: { idToken: of("token") } },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap({}) } },
        },
      ],
    });
    const page = TestBed.runInInjectionContext(() => new OnboardingPage());
    const state = signal("ready");
    page.chat.set({
      get status() {
        return state();
      },
      messages: [],
    } as any);
    expect(page.thinking()).toBeFalse();
    state.set("submitted");
    expect(page.thinking()).toBeTrue();
    state.set("streaming");
    expect(page.thinking()).toBeTrue();
    state.set("error");
    expect(page.thinking()).toBeFalse();
  });
});
