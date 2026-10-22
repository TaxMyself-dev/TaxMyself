import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { finalize } from 'rxjs/operators';
import { AdminBillingService, AdminRefund, RefundContext, RefundPayment, RefundProviderCheck } from 'src/app/services/admin-billing.service';

@Component({
  selector: 'app-billing-refund-dialog', standalone: true,
  imports: [CommonModule, FormsModule, DialogModule],
  styles: [`
    .refund-form { display: grid; gap: 16px; direction: rtl; }
    label { display: grid; gap: 6px; font-weight: 500; }
    select,input,textarea { width:100%; border:1px solid #d1d5db; border-radius:8px; padding:10px; font:inherit; }
    button { border:0; border-radius:8px; padding:10px 16px; background:#18181b; color:white; font:inherit; cursor:pointer; }
    button:disabled { opacity:.45; cursor:default; }
    .refund-note { color:#52525b; margin:0; }
    .refund-error { color:#b91c1c; }
    .refund-history { border-top:1px solid #e4e4e7; margin-top:20px; padding-top:16px; }
    article { border:1px solid #e4e4e7; border-radius:8px; padding:12px; margin:12px 0; }
    article label { margin-top:10px; }
    .refund-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:12px; }
    .refund-confirm { display:flex; align-items:flex-start; gap:8px; }
    .refund-confirm input { width:auto; margin-top:5px; }
  `],
  template: `
  <p-dialog [visible]="true" (visibleChange)="!$event && closed.emit()" [modal]="true"
    [header]="'זיכוי — ' + userName" [style]="{width:'620px', maxWidth:'95vw'}" [closable]="!busy()" [closeOnEscape]="!busy()">
    <div dir="rtl" aria-live="polite">
      <p class="refund-note">הכסף יוחזר לכרטיס של החיוב המקורי ויופק מסמך זיכוי. המנוי והחיובים העתידיים יישארו ללא שינוי.</p>
      @if (loading()) { <p>טוען תשלומים וזיכויים…</p> }
      @if (error()) { <p class="refund-error" role="alert">{{ error() }}</p> }
      @if (message()) { <p role="status">{{ message() }}</p> }
      @if (!loading() && context(); as ctx) {
        <form class="refund-form" (ngSubmit)="submit()">
          <label>תשלום לזיכוי
            <select name="payment" [ngModel]="paymentId" (ngModelChange)="selectPayment($event)" [disabled]="busy()">
              <option [ngValue]="null">בחירת תשלום</option>
              @for (p of ctx.payments; track p.paymentEventId) {
                <option [ngValue]="p.paymentEventId">{{ p.date | date:'dd/MM/yyyy' }} — {{ p.amountAgorot / 100 | number:'1.2-2' }} ₪ @if (creditedAgorot(p) > 0) { (זוכה: {{ creditedAgorot(p) / 100 | number:'1.0-2' }} ₪) } — עסקה {{ p.transactionId ?? 'חסרה' }}</option>
              }
            </select>
          </label>
          @if (selectedPayment(); as p) {
            <p>יתרה לזיכוי: {{ p.remainingAgorot / 100 | number:'1.2-2' }} ₪</p>
            @if (p.blockedReason) { <p class="refund-error">{{ p.blockedReason }}</p> }
          }
          <label>סכום לזיכוי בש״ח <input name="amount" inputmode="decimal" [(ngModel)]="amount" [disabled]="busy()" /></label>
          <label>סיבת הזיכוי <textarea name="reason" [(ngModel)]="reason" maxlength="500" rows="2" [disabled]="busy()"></textarea></label>
          <label class="refund-confirm"><input name="confirm" type="checkbox" [(ngModel)]="confirmed" [disabled]="busy()" />בדקתי את התשלום והסכום ואני מאשר החזר כספי ללקוח.</label>
          <button type="submit" [disabled]="!canSubmit()">{{ busy() ? 'בטיפול…' : 'ביצוע זיכוי והפקת מסמך' }}</button>
        </form>
        @if (!ctx.payments.length) { <p>לא נמצאו תשלומים לזיכוי.</p> }
        <section class="refund-history" aria-label="היסטוריית זיכויים">
          <h3>זיכויים וטיפול בתהליכים ממתינים</h3>
          <button type="button" (click)="load()" [disabled]="busy()">רענון מצב</button>
          @for (r of ctx.refunds; track r.attemptId) {
            <article>
              <strong>−{{ r.amountAgorot / 100 | number:'1.2-2' }} ₪ · {{ labels[r.status] ?? r.status }}</strong>
              <p>{{ r.createdAt | date:'dd/MM/yyyy HH:mm' }} · {{ r.reason }}</p>
              @if (r.providerResponseCode != null) {
                <p>קוד תשובת קארדקום: {{ r.providerResponseCode }}</p>
                <p>{{ r.providerDescription ?? 'תיאור התשובה לא נשמר בבקשה זו.' }}</p>
              } @else if (r.status === 'UNKNOWN') { <p>לא נשמרה תשובת API תקינה לבקשה זו.</p> }
              @if (r.transactionId) { <p>מספר עסקת זיכוי: {{ r.transactionId }}</p> }
              @if (r.status === 'CAPTURED') {
                @if (r.completionError; as failure) {
                  <div class="refund-error" role="alert">
                    <p>שגיאה בהשלמת המסמך — {{ completionStages[failure.stage] ?? failure.stage }}</p>
                    <p>{{ failure.message }}</p>
                    <p>{{ failure.occurredAt | date:'dd/MM/yyyy HH:mm' }}</p>
                  </div>
                }
                <p>ההחזר אושר. אפשר להשלים מסמך ושליחה בלי לזכות שוב.</p>
                <button type="button" [disabled]="busy()" (click)="resolve(r, 'COMPLETE')">השלמת מסמך ושליחה</button>
              }
              @if (r.status === 'UNKNOWN' || r.status === 'MANUAL_REVIEW') {
                <button type="button" [disabled]="busy()" (click)="checkProvider(r)">בדיקה מול קארדקום — ללא זיכוי נוסף</button>
                @if (providerChecks()[r.attemptId]; as check) {
                  <p>{{ check.message }}</p>
                  @if (!check.complete) { <p>הסריקה חלקית; לא כל התוצאות נבדקו.</p> }
                  @for (candidate of check.candidates; track candidate.transactionId) {
                    <p>עסקת זיכוי {{ candidate.transactionId }} · קוד {{ candidate.responseCode }} · {{ candidate.description ?? '' }} · {{ candidate.date | date:'dd/MM/yyyy HH:mm' }}</p>
                  }
                }
                <p>תוצאת ההחזר אינה ידועה. יש לבדוק בקארדקום את עסקת המקור לפני הכרעה. הפעולות הבאות מתעדות את הבדיקה ואינן שולחות זיכוי חדש.</p>
                <label>תיעוד ואסמכתה לבדיקה (ללא פרטי כרטיס)<textarea [name]="'evidence'+r.attemptId" [(ngModel)]="evidence[r.attemptId]" maxlength="500"></textarea></label>
                <label>מספר עסקת הזיכוי בקארדקום<input [name]="'transaction'+r.attemptId" [(ngModel)]="transactionIds[r.attemptId]" inputmode="numeric" /></label>
                <label class="refund-confirm"><input type="checkbox" [name]="'review'+r.attemptId" [(ngModel)]="reviewConfirmed[r.attemptId]" />בדקתי מול קארדקום את התוצאה הסופית של הבקשה, לרבות בקשה שעשויה עדיין להיות בטיפול.</label>
                <div class="refund-actions">
                  <button type="button" [disabled]="busy() || !reviewConfirmed[r.attemptId] || (evidence[r.attemptId]?.trim()?.length ?? 0) < 10 || !transactionIds[r.attemptId]" (click)="resolve(r,'CONFIRM_REFUNDED')">אישור שבוצע החזר והשלמת מסמך</button>
                  <button type="button" [disabled]="busy() || !reviewConfirmed[r.attemptId] || (evidence[r.attemptId]?.trim()?.length ?? 0) < 10" (click)="resolve(r,'CONFIRM_NOT_REFUNDED')">אישור סופי שלא בוצע החזר</button>
                </div>
              }
            </article>
          } @empty { <p>אין זיכויים קודמים.</p> }
        </section>
      }
    </div>
  </p-dialog>`
})
export class BillingRefundDialogComponent implements OnInit {
  @Input({ required: true }) subscriptionId!: number;
  @Input() userName = '';
  @Output() closed = new EventEmitter<void>();
  private readonly api = inject(AdminBillingService);
  readonly context = signal<RefundContext | null>(null);
  readonly loading = signal(false); readonly busy = signal(false);
  readonly error = signal(''); readonly message = signal('');
  readonly providerChecks = signal<Record<number, RefundProviderCheck>>({});
  paymentId: number | null = null; amount = ''; reason = ''; confirmed = false;
  evidence: Record<number, string> = {}; transactionIds: Record<number, string> = {};
  reviewConfirmed: Record<number, boolean> = {};
  private lastRequest: { signature: string; id: string } | null = null;
  readonly completionStages: Record<string, string> = { SOURCE_DOCUMENT: 'בדיקת מסמך המקור',
    CREATE_CREDIT: 'יצירת מסמך זיכוי', LINK_CREDIT: 'קישור המסמך לזיכוי',
    PDF_SIGN_UPLOAD: 'הפקת PDF, חתימה והעלאה', EMAIL: 'שליחת אימייל', FINALIZE: 'עדכון סיום התהליך' };
  readonly labels: Record<string, string> = { PROCESSING: 'נשלח לקארדקום', UNKNOWN: 'נדרש בירור מול קארדקום',
    MANUAL_REVIEW: 'נדרשת בדיקה', CAPTURED: 'הכסף הוחזר — המסמך או השליחה ממתינים', COMPLETED: 'הזיכוי והמסמך הושלמו',
    DECLINED: 'נסגר לאחר אישור שלא בוצע החזר', CREATED: 'ממתין לביצוע' };
  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true);
    this.api.getRefundContext(this.subscriptionId).pipe(finalize(() => this.loading.set(false))).subscribe({
      next: ctx => this.context.set(ctx), error: () => { this.context.set(null); this.error.set('לא ניתן לטעון תשלומים. יש לרענן.'); } });
  }
  selectedPayment(): RefundPayment | undefined { return this.context()?.payments.find(p => p.paymentEventId === this.paymentId); }
  creditedAgorot(payment: RefundPayment): number {
    return (this.context()?.refunds ?? []).filter(r => r.paymentEventId === payment.paymentEventId &&
      (r.status === 'CAPTURED' || r.status === 'COMPLETED')).reduce((total, r) => total + r.amountAgorot, 0);
  }
  selectPayment(id: number | null) { this.paymentId = id; this.amount = ((this.selectedPayment()?.remainingAgorot ?? 0) / 100).toFixed(2); this.confirmed = false; }
  amountAgorot() { return /^\d+(\.\d{1,2})?$/.test(this.amount.trim()) ? Math.round(Number(this.amount) * 100) : 0; }
  canSubmit() {
    const p = this.selectedPayment(), amount = this.amountAgorot();
    return !this.loading() && !this.busy() && p && !p.blockedReason && Number.isSafeInteger(amount) && amount > 0 &&
      amount <= p.remainingAgorot && this.reason.trim().length >= 3 && this.confirmed;
  }
  submit() {
    if (!this.canSubmit()) return;
    const payload = { paymentEventId: this.paymentId!, amountAgorot: this.amountAgorot(), reason: this.reason.trim() };
    const signature = JSON.stringify(payload);
    if (this.lastRequest?.signature !== signature) this.lastRequest = { signature, id: crypto.randomUUID() };
    this.busy.set(true); this.error.set(''); this.message.set('');
    this.api.createRefund(this.subscriptionId, { ...payload, requestId: this.lastRequest!.id })
      .pipe(finalize(() => { this.busy.set(false); this.confirmed = false; this.load(); }))
      .subscribe({ next: r => this.message.set(this.labels[r.status] ?? 'הבקשה נשמרה'),
        error: err => this.error.set(err?.error?.message ?? 'לא התקבלה תוצאה סופית. יש לבדוק את מצב הזיכוי לפני ניסיון נוסף.') });
  }
  checkProvider(r: AdminRefund) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.providerChecks.update(checks => { const next = { ...checks }; delete next[r.attemptId]; return next; });
    this.api.checkRefundProvider(this.subscriptionId, r.attemptId).pipe(finalize(() => this.busy.set(false)))
      .subscribe({ next: result => this.providerChecks.update(checks => ({ ...checks, [r.attemptId]: result })),
        error: err => this.error.set(err?.error?.message ?? 'הבדיקה לא הושלמה; מצב הזיכוי לא שונה.') });
  }
  resolve(r: AdminRefund, action: 'COMPLETE' | 'CONFIRM_REFUNDED' | 'CONFIRM_NOT_REFUNDED') {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    this.api.resolveRefund(this.subscriptionId, r.attemptId, { action, expectedStateVersion: r.stateVersion,
      ...(action !== 'COMPLETE' ? { evidence: this.evidence[r.attemptId]?.trim(),
        ...(action === 'CONFIRM_REFUNDED' ? { transactionId: this.transactionIds[r.attemptId]?.trim() } : {}) } : {}) })
      .pipe(finalize(() => { this.busy.set(false); this.load(); }))
      .subscribe({ next: result => this.message.set(this.labels[result.status] ?? result.status),
        error: err => this.error.set(err?.error?.message ?? 'הפעולה לא הושלמה; יש לבדוק את המצב המעודכן.') });
  }
}
