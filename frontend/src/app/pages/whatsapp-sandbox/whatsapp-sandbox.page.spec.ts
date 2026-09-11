import { ComponentFixture, TestBed } from "@angular/core/testing";
import { provideHttpClient } from "@angular/common/http";
import {
  HttpTestingController,
  provideHttpClientTesting,
} from "@angular/common/http/testing";
import { WhatsAppSandboxPage } from "./whatsapp-sandbox.page";

describe("WhatsAppSandboxPage", () => {
  let fixture: ComponentFixture<WhatsAppSandboxPage>;
  let component: WhatsAppSandboxPage;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WhatsAppSandboxPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(WhatsAppSandboxPage);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it("shows that the local fake provider is connected", async () => {
    fixture.detectChanges();
    http.expectOne("http://localhost:3001/whatsapp/sandbox").flush({
      available: true,
      provider: "fake",
    });
    await fixture.whenStable();
    expect(component.connection()).toBe("online");
  });

  it("adds an inbound text bubble and exposes bounded parser metadata", async () => {
    component.messageText = "בדיקת הודעה";
    const pending = component.sendText();
    http.expectOne("http://localhost:3001/whatsapp/sandbox/inbound").flush({
      signatureVerified: true,
      event: { kind: "message.text", text: "בדיקת הודעה" },
      media: null,
      steps: ["signature_verified", "payload_parsed"],
    });
    await pending;

    expect(component.messages().at(-1)?.text).toBe("בדיקת הודעה");
    expect(component.eventEntries()).toContain(
      jasmine.objectContaining({ key: "kind", value: "message.text" })
    );
  });

  it("renders the simulated failed delivery path", async () => {
    component.deliveryOutcome = "failed";
    const pending = component.sendTemplate();
    http.expectOne("http://localhost:3001/whatsapp/sandbox/template").flush({
      providerMessageId: "fake-1",
      preview: "בקשת מסמכים",
      statuses: [
        { status: "sent", errorCode: null },
        { status: "failed", errorCode: 131026 },
      ],
    });
    await pending;

    expect(component.messages().at(-1)?.statuses).toEqual([
      "sent",
      "failed (131026)",
    ]);
  });
});
