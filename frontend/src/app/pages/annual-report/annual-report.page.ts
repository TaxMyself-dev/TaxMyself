import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AuthService } from 'src/app/services/auth.service';
import { ClientPanelService } from 'src/app/services/clients-panel.service';
import { FilesService } from 'src/app/services/files.service';
import { AnnualReportService } from 'src/app/services/annual-report.service';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import {
  ANNUAL_REPORT_QUESTIONS,
  AnnualReportDocCategory,
  AnnualReportDocCategoryLabels,
  AnnualReportQuestionDef,
  AnnualReportStatus,
  AnnualReportStatusLabels,
  RequiredCategoryEntry,
} from 'src/app/shared/enums';
import { IAnnualReport, IAnnualReportFile } from 'src/app/shared/interface';

type WizardStep = 'questions' | 'docs' | 'review';

@Component({
  selector: 'app-annual-report',
  templateUrl: './annual-report.page.html',
  styleUrls: ['./annual-report.page.scss'],
  standalone: false,
})
export class AnnualReportPage implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly clientPanelService = inject(ClientPanelService);
  private readonly filesService = inject(FilesService);
  private readonly annualReportService = inject(AnnualReportService);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;
  readonly AnnualReportStatus = AnnualReportStatus;
  readonly AnnualReportStatusLabels = AnnualReportStatusLabels;
  readonly AnnualReportDocCategoryLabels = AnnualReportDocCategoryLabels;

  readonly questions: AnnualReportQuestionDef[] = ANNUAL_REPORT_QUESTIONS;

  readonly report = signal<IAnnualReport | null>(null);
  readonly loading = signal<boolean>(false);
  readonly busy = signal<boolean>(false);

  /** השנה הנבחרת לשאלון – ברירת מחדל: שנת המס שזה עתה הסתיימה */
  readonly taxYear = signal<number>(new Date().getFullYear() - 1);
  readonly availableYears = signal<number[]>(this.computeAvailableYears());

  /** תשובות גולמיות – ערך לכל שאלה: boolean או number (תלוי ב-question.type) */
  readonly answers = signal<Record<string, boolean | number>>({});
  readonly currentStep = signal<WizardStep>('questions');

  /** רשימת שאלות שצריכות תשובה כעת (כולל לוגיקת dependsOn) */
  readonly visibleQuestions = computed<AnnualReportQuestionDef[]>(() => {
    const a = this.answers();
    return this.questions.filter((q) => {
      if (!q.dependsOn) return true;
      return a[q.dependsOn.questionId] === q.dependsOn.equals;
    });
  });

  readonly allAnswered = computed<boolean>(() => {
    const a = this.answers();
    return this.visibleQuestions().every((q) => {
      const v = a[q.id];
      if (q.type === 'boolean') return typeof v === 'boolean';
      return typeof v === 'number' && Number.isFinite(v) && v >= 1;
    });
  });

  readonly requiredCategories = computed<RequiredCategoryEntry[]>(() => {
    return this.report()?.requiredCategories ?? [];
  });

  /** קבצים מסווגים לפי קטגוריה */
  readonly filesByCategory = computed<Record<string, IAnnualReportFile[]>>(() => {
    const map: Record<string, IAnnualReportFile[]> = {};
    for (const f of this.report()?.files ?? []) {
      (map[f.category] ??= []).push(f);
    }
    return map;
  });

  /** קטגוריות שעדיין לא הגיעו לכמות הנדרשת */
  readonly missingCategories = computed<RequiredCategoryEntry[]>(() => {
    const filesMap = this.filesByCategory();
    return this.requiredCategories().filter(
      (req) => (filesMap[req.category]?.length ?? 0) < req.minCount,
    );
  });

  readonly canFinish = computed<boolean>(() => {
    const r = this.report();
    if (!r) return false;
    if (r.status !== AnnualReportStatus.WAITING_FOR_DOCS) return false;
    if (!this.allAnswered()) return false;
    return this.missingCategories().length === 0;
  });

  /** האם המשתמש המחובר הוא רואה החשבון של הלקוח (לא הלקוח עצמו) */
  readonly isAccountantView = computed<boolean>(() => {
    const r = this.report();
    if (!r) return false;
    const myId = this.authService.getUserDataFromLocalStorage()?.firebaseId;
    return !!myId && myId !== r.clientFirebaseId;
  });

  private routeSub?: Subscription;

  ngOnInit(): void {
    this.routeSub = this.route.queryParamMap.subscribe((params) => {
      const yearParam = params.get('taxYear');
      if (yearParam) {
        const y = parseInt(yearParam, 10);
        if (!isNaN(y)) this.taxYear.set(y);
      }
      this.loadReport();
    });
  }

  ionViewWillLeave(): void {
    this.routeSub?.unsubscribe();
    this.flushPendingAutoSave();
  }

  ngOnDestroy(): void {
    this.flushPendingAutoSave();
  }

  /** If a debounced auto-save is queued, fire it immediately. */
  private flushPendingAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
      this.persistAnswersSilently();
    }
  }

  loadReport(): void {
    const businessNumber = this.getBusinessNumber();
    if (!businessNumber) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'לא נמצא עסק פעיל. נא להיכנס דרך משרד הלקוחות או לבחור עסק.',
        life: 4000,
        key: 'br',
      });
      return;
    }
    this.loading.set(true);
    this.annualReportService.getOrCreate(businessNumber, this.taxYear()).subscribe({
      next: (r) => this.applyReport(r),
      error: (err) => {
        this.loading.set(false);
        this.toastError(err, 'טעינת הדוח נכשלה');
      },
    });
  }

  onYearChange(year: number): void {
    this.taxYear.set(year);
    this.loadReport();
  }

  private applyReport(r: IAnnualReport): void {
    this.report.set(r);
    this.answers.set((r.answers as Record<string, boolean | number>) ?? {});
    // Pick a sensible default step based on status + completion.
    if (r.status === AnnualReportStatus.WAITING_FOR_DOCS) {
      const hasAnswers = r.answers && Object.keys(r.answers).length > 0;
      this.currentStep.set(hasAnswers ? 'docs' : 'questions');
    } else {
      this.currentStep.set('review');
    }
    this.loading.set(false);
  }

  // ---------- Step 1: questionnaire ----------

  setAnswer(questionId: string, value: boolean | number): void {
    const next: Record<string, boolean | number> = { ...this.answers(), [questionId]: value };
    // If a parent question flipped, clear all descendants that depend on it (transitive).
    const stale = new Set<string>([questionId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const q of this.questions) {
        if (!q.dependsOn) continue;
        if (!stale.has(q.dependsOn.questionId)) continue;
        if (next[q.dependsOn.questionId] !== q.dependsOn.equals && next[q.id] !== undefined) {
          delete next[q.id];
          stale.add(q.id);
          changed = true;
        }
      }
    }
    this.answers.set(next);
    this.scheduleAutoSave();
  }

  /** Debounced auto-save so partial answers survive a tab close mid-questionnaire. */
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly AUTO_SAVE_DELAY_MS = 800;

  private scheduleAutoSave(): void {
    const r = this.report();
    // Only auto-save while the report is still being edited.
    if (!r || r.status !== AnnualReportStatus.WAITING_FOR_DOCS) return;
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      this.persistAnswersSilently();
    }, this.AUTO_SAVE_DELAY_MS);
  }

  private persistAnswersSilently(): void {
    const r = this.report();
    if (!r) return;
    this.annualReportService.saveAnswers(r.id, this.answers()).subscribe({
      next: (updated) => {
        // Update the local report so requiredCategories stays in sync,
        // but DON'T touch currentStep — the user is still editing.
        this.report.set({ ...updated, files: r.files });
      },
      error: (err) => {
        console.error('Auto-save failed', err);
      },
    });
  }

  /** Numeric answer handler from `<input type=number>` (clamps to integer ≥ 1) */
  setNumericAnswer(questionId: string, raw: string | number): void {
    const n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!Number.isFinite(n) || n < 1) {
      const next = { ...this.answers() };
      delete next[questionId];
      this.answers.set(next);
      return;
    }
    this.setAnswer(questionId, Math.floor(n));
  }

  /** Type-narrowed reader so the template can ask "is this answer truthy/numeric/etc." */
  answerOf(questionId: string): boolean | number | undefined {
    return this.answers()[questionId];
  }

  saveAnswersAndProceed(): void {
    const r = this.report();
    if (!r || !this.allAnswered()) return;
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    this.busy.set(true);
    this.annualReportService.saveAnswers(r.id, this.answers()).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.report.set(updated);
        this.currentStep.set('docs');
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'התשובות נשמרו',
          life: 2000,
          key: 'br',
        });
      },
      error: (err) => {
        this.busy.set(false);
        this.toastError(err, 'שמירת התשובות נכשלה');
      },
    });
  }

  // ---------- Step 2: docs ----------

  onFilePicked(event: Event, category: string): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadFile(file, category);
    input.value = '';
  }

  private uploadFile(file: File, category: string): void {
    const r = this.report();
    if (!r) return;
    const businessNumber = this.getBusinessNumber();
    if (!businessNumber) return;
    this.busy.set(true);
    this.annualReportService.uploadFile(r.id, businessNumber, file, category).subscribe({
      next: (saved) => {
        this.busy.set(false);
        // append the new file to the local report state
        const current = this.report();
        if (current) {
          this.report.set({ ...current, files: [...current.files, saved] });
        }
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'הקובץ הועלה',
          life: 2000,
          key: 'br',
        });
      },
      error: (err) => {
        this.busy.set(false);
        this.toastError(err, 'העלאת הקובץ נכשלה');
      },
    });
  }

  confirmRemoveFile(file: IAnnualReportFile): void {
    this.confirmationService.confirm({
      message: `האם להסיר את הקובץ "${file.fileName}"?`,
      header: 'אישור הסרה',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'הסר',
      rejectLabel: 'ביטול',
      accept: () => this.removeFile(file),
    });
  }

  private removeFile(file: IAnnualReportFile): void {
    this.busy.set(true);
    // Remove from Firebase Storage first, then from DB.
    this.filesService.deleteFileFromFirebase(file.filePath).subscribe({
      next: () => {
        this.annualReportService.removeFile(file.id).subscribe({
          next: () => {
            this.busy.set(false);
            const current = this.report();
            if (current) {
              this.report.set({
                ...current,
                files: current.files.filter((f) => f.id !== file.id),
              });
            }
            this.messageService.add({
              severity: 'success',
              summary: 'הצלחה',
              detail: 'הקובץ הוסר',
              life: 2000,
              key: 'br',
            });
          },
          error: (err) => {
            this.busy.set(false);
            this.toastError(err, 'הסרת הקובץ נכשלה');
          },
        });
      },
      error: (err) => {
        this.busy.set(false);
        this.toastError(err, 'הסרת הקובץ מהאחסון נכשלה');
      },
    });
  }

  previewFile(file: IAnnualReportFile): void {
    this.filesService.previewFile(file.filePath).subscribe();
  }

  async downloadFile(file: IAnnualReportFile): Promise<void> {
    try {
      const fetched = await this.filesService.getFirebaseUrlFile(file.filePath);
      if (!fetched?.blob) {
        this.toastError({}, 'הורדת הקובץ נכשלה');
        return;
      }
      // Use the original (display) filename, not the storage key with the nanoid prefix.
      this.filesService.downloadFile(file.fileName, fetched.blob);
    } catch (err) {
      this.toastError(err, 'הורדת הקובץ נכשלה');
    }
  }

  // ---------- Step 3: review / finish ----------

  finish(): void {
    const r = this.report();
    if (!r || !this.canFinish()) return;
    this.busy.set(true);
    this.annualReportService.finish(r.id).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.report.set(updated);
        this.currentStep.set('review');
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: 'הדוח נשלח להכנה',
          life: 3000,
          key: 'br',
        });
      },
      error: (err) => {
        this.busy.set(false);
        this.toastError(err, 'סיום הדוח נכשל');
      },
    });
  }

  setReported(reported: boolean): void {
    const r = this.report();
    if (!r) return;
    this.busy.set(true);
    this.annualReportService.setReported(r.id, reported).subscribe({
      next: (updated) => {
        this.busy.set(false);
        this.report.set(updated);
        this.messageService.add({
          severity: 'success',
          summary: 'הצלחה',
          detail: reported ? 'הדוח סומן כדווח' : 'הסימון בוטל',
          life: 2000,
          key: 'br',
        });
      },
      error: (err) => {
        this.busy.set(false);
        this.toastError(err, 'עדכון הסטטוס נכשל');
      },
    });
  }

  goToStep(step: WizardStep): void {
    if (this.report()?.status !== AnnualReportStatus.WAITING_FOR_DOCS) return;
    this.currentStep.set(step);
  }

  // ---------- helpers ----------

  statusLabel(status: string | undefined): string {
    return status ? AnnualReportStatusLabels[status] ?? status : '';
  }

  categoryLabel(cat: string): string {
    return AnnualReportDocCategoryLabels[cat] ?? cat;
  }

  private getBusinessNumber(): string | null {
    const fromAuth = this.authService.getActiveBusinessNumber();
    if (fromAuth) return fromAuth;
    const userData = this.authService.getUserDataFromLocalStorage();
    return userData?.businessNumber ?? null;
  }

  private computeAvailableYears(): number[] {
    const lastFiscal = new Date().getFullYear() - 1;
    return [lastFiscal + 1, lastFiscal, lastFiscal - 1, lastFiscal - 2, lastFiscal - 3];
  }

  private toastError(err: any, fallback: string): void {
    const detail = err?.error?.message ?? err?.message ?? fallback;
    this.messageService.add({
      severity: 'error',
      summary: 'שגיאה',
      detail,
      life: 4000,
      key: 'br',
    });
  }
}
