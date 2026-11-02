import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs/operators';
import { ShaamService, ShaamUnknownAllocationAttempt } from '../../services/shaam.service';

@Component({
  selector: 'app-admin-shaam-allocations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section dir="rtl" class="shaam-unknown">
      <header><h2>בקשות הקצאה לא ודאיות</h2><p>יש להכריע רק לאחר אימות מול רשות המסים. ההכרעה נרשמת ביומן הביקורת.</p><button type="button" (click)="load()" [disabled]="loading">רענון</button></header>
      <p *ngIf="!loading && attempts.length === 0">אין בקשות שממתינות לבירור.</p>
      <article *ngFor="let attempt of attempts" class="attempt">
        <dl>
          <div><dt>מזהה בקשה</dt><dd>{{ attempt.requestId }}</dd></div>
          <div><dt>מסמך</dt><dd>{{ attempt.docType }} {{ attempt.docNumber }}</dd></div>
          <div><dt>עוסק</dt><dd>{{ attempt.issuerBusinessNumber }}</dd></div>
          <div><dt>סיבה</dt><dd>{{ attempt.failureCategory || 'לא ידועה' }} ({{ attempt.httpStatus || 'ללא קוד' }})</dd></div>
        </dl>
        <label>אסמכתת בירור<input [(ngModel)]="evidence[attempt.attemptId]" maxlength="100" placeholder="ticket-123" /></label>
        <label>מספר הקצאה שאומת (רק אם התקבל)<input [(ngModel)]="allocationNumbers[attempt.attemptId]" maxlength="50" inputmode="numeric" /></label>
        <div class="actions"><button type="button" (click)="resolve(attempt, 'CONFIRMED_NOT_ACCEPTED')">אומת שלא נקלט</button><button type="button" (click)="resolve(attempt, 'CONFIRMED_APPROVED')">אומת שהוקצה</button></div>
      </article>
    </section>
  `,
  styles: [`.shaam-unknown{padding:1rem}.attempt{border:1px solid #d9d9d9;border-radius:8px;padding:1rem;margin:1rem 0}dl div{display:flex;gap:.5rem;margin-bottom:.35rem}dt{font-weight:700}label{display:block;margin:.65rem 0}input{display:block;width:min(30rem,100%);padding:.5rem}.actions{display:flex;gap:.5rem;flex-wrap:wrap}`],
})
export class AdminShaamAllocationsComponent implements OnInit {
  attempts: ShaamUnknownAllocationAttempt[] = [];
  evidence: Record<number, string> = {};
  allocationNumbers: Record<number, string> = {};
  loading = false;
  constructor(private readonly shaam: ShaamService, private readonly messages: MessageService) {}
  ngOnInit(): void { this.load(); }
  load(): void {
    this.loading = true;
    this.shaam.listUnknownAllocationAttempts().pipe(finalize(() => this.loading = false)).subscribe({
      next: (attempts) => this.attempts = attempts,
      error: (error) => this.notify('error', error?.error?.message || 'טעינת הבקשות נכשלה'),
    });
  }
  resolve(attempt: ShaamUnknownAllocationAttempt, action: 'CONFIRMED_NOT_ACCEPTED' | 'CONFIRMED_APPROVED'): void {
    const evidence = (this.evidence[attempt.attemptId] || '').trim();
    const allocationNumber = (this.allocationNumbers[attempt.attemptId] || '').trim();
    if (!/^[A-Za-z0-9._:-]{1,100}$/.test(evidence)) { this.notify('warn', 'יש להזין אסמכתה קצרה באותיות לטיניות, ספרות או . _ : -'); return; }
    if (action === 'CONFIRMED_APPROVED' && !/^\d{1,50}$/.test(allocationNumber)) { this.notify('warn', 'יש להזין את מספר ההקצאה שאומת'); return; }
    this.shaam.resolveUnknownAllocationAttempt(attempt.attemptId, action, evidence, action === 'CONFIRMED_APPROVED' ? allocationNumber : undefined).subscribe({
      next: () => { this.notify('success', 'ההכרעה נשמרה'); this.load(); },
      error: (error) => this.notify('error', error?.error?.message || 'שמירת ההכרעה נכשלה'),
    });
  }
  private notify(severity: 'success' | 'warn' | 'error', detail: string): void {
    this.messages.add({ severity, summary: 'הקצאות שע״מ', detail, key: 'br', life: 6000 });
  }
}
