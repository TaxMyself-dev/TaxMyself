import { TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  provideHttpClientTesting,
  HttpTestingController,
} from "@angular/common/http/testing";
import { provideRouter } from "@angular/router";
import { OnboardingInvitationComponent } from "./onboarding-invitation.component";
describe("onboarding invitation", () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    })
  );
  afterEach(() => TestBed.inject(HttpTestingController).verify());
  it("opens a native modal for an unknown multi-business user", async () => {
    const fixture = TestBed.createComponent(OnboardingInvitationComponent);
    fixture.componentInstance.apiUrl = "http://localhost:3017/";
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne("http://localhost:3017/api/agent-profile/businesses")
      .flush([
        { number: "111", invitation: "new" },
        { number: "222", invitation: "new" },
      ]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("dialog").open).toBeTrue();
    fixture.nativeElement.querySelector("dialog").close();
  });
  it("does not reopen an invitation deferred by the owner", async () => {
    const fixture = TestBed.createComponent(OnboardingInvitationComponent);
    fixture.componentInstance.apiUrl = "http://localhost:3017/";
    fixture.detectChanges();
    TestBed.inject(HttpTestingController)
      .expectOne("http://localhost:3017/api/agent-profile/businesses")
      .flush([{ number: "111", invitation: "deferred" }]);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector("dialog").open).toBeFalse();
  });
});
