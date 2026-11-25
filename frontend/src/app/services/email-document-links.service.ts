import { Injectable } from "@angular/core";
import { HttpClient, HttpParams } from "@angular/common/http";
import { environment } from "src/environments/environment";
export interface PendingEmailLink {
  id: string;
  name: string;
  subject: string | null;
  from: string | null;
  date: string | null;
  reason: string;
}
export const EMAIL_LINK_REASONS: Record<string, string> = {
  LINK_ACCESS_REQUIRED: "נדרשת התחברות או הרשאה למסמך",
  LINK_EXPIRED: "המסמך לא נמצא או שהקישור פג תוקף",
  LINK_INVALID_FILE: "לא התקבל קובץ PDF תקין",
  LINK_UNSAFE_DESTINATION: "לא ניתן לפתוח את כתובת המסמך באופן אוטומטי",
  LINK_DOWNLOAD_UNAVAILABLE: "ההורדה האוטומטית לא הושלמה",
  LINK_BUDGET_EXHAUSTED: "ההורדה לא הושלמה במסגרת הניסיון האוטומטי",
  LINK_BROWSER_UNAVAILABLE: "ההורדה האוטומטית אינה זמינה כעת",
  LINK_ATTEMPT_INTERRUPTED: "ניסיון ההורדה נקטע; נדרשת העלאה ידנית",
  LINK_MANUAL_REQUIRED: "נדרשת הורדה והעלאה ידנית של המסמך",
};
@Injectable({ providedIn: "root" })
export class EmailDocumentLinksService {
  private readonly base = environment.apiUrl + "integrations/document-links";
  constructor(readonly http: HttpClient) {}
  list(businessNumber: string, cursor?: string) {
    return this.http.get<{
      items: PendingEmailLink[];
      nextCursor: string | null;
    }>(this.base, {
      params: new HttpParams()
        .set("businessNumber", businessNumber)
        .set("cursor", cursor || ""),
    });
  }
  original(id: string, businessNumber: string) {
    return this.http.get<{ url: string }>(
      this.base + "/" + encodeURIComponent(id) + "/original",
      { params: { businessNumber } }
    );
  }
  upload(id: string, businessNumber: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    return this.http.post<{ accepted: boolean }>(
      this.base + "/" + encodeURIComponent(id) + "/upload",
      form,
      { params: { businessNumber } }
    );
  }
}
