import { signal } from "@angular/core";
import { Observable, finalize } from "rxjs";
export interface ProtectedUploadDocument {
  protectedDocumentId?: number;
  name: string;
  canUploadOpenCopy?: boolean;
}
export interface ProtectedUploadRequest {
  documentId: number;
  businessNumber: string;
  file: File;
  key: string;
  confirmed: true;
}
/** Small UI state machine: retry preserves the selected document, bytes and request key. */
export class ProtectedPdfUploadFlow {
  readonly document = signal<ProtectedUploadDocument | null>(null);
  readonly busy = signal(false);
  file: File | null = null;
  confirmed = false;
  key = "";
  businessNumber = "";
  error = "";
  constructor(
    private readonly newKey: () => string = () => crypto.randomUUID(),
  ) {}
  open(document: ProtectedUploadDocument, businessNumber: string): void {
    if (
      !document.protectedDocumentId ||
      !document.canUploadOpenCopy ||
      this.busy()
    )
      return;
    this.document.set(document);
    this.businessNumber = businessNumber;
    this.file = null;
    this.confirmed = false;
    this.key = this.newKey();
    this.error = "";
  }
  select(file: File | undefined): void {
    if (this.busy()) return;
    this.file = null;
    this.confirmed = false;
    this.error = "";
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) || file.size > 10 * 1024 * 1024) {
      this.error = "יש לבחור קובץ PDF בגודל עד 10MB";
      return;
    }
    this.file = file;
    this.key = this.newKey();
  }
  submit(
    send: (request: ProtectedUploadRequest) => Observable<any>,
    accepted: () => void,
  ): void {
    const row = this.document();
    if (
      !row?.protectedDocumentId ||
      !this.file ||
      !this.confirmed ||
      this.busy()
    )
      return;
    this.busy.set(true);
    this.error = "";
    send({
      documentId: row.protectedDocumentId,
      businessNumber: this.businessNumber,
      file: this.file,
      key: this.key,
      confirmed: true,
    })
      .pipe(finalize(() => this.busy.set(false)))
      .subscribe({
        next: (result) => {
          if (!result.accepted) {
            this.error = "ההעלאה טרם הושלמה; ניתן לנסות שוב";
            return;
          }
          this.document.set(null);
          accepted();
        },
        error: (error) => {
          this.error =
            typeof error?.error?.message === "string"
              ? error.error.message
              : "לא ניתן היה להשלים את ההעלאה; המקור נשמר. נסה שוב";
        },
      });
  }
}
