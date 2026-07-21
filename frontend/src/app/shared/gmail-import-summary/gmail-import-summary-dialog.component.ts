import { Component, inject } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { GmailSyncStateService } from 'src/app/services/gmail-sync-state.service';
import { GmailImportSummaryComponent } from './gmail-import-summary.component';

/**
 * מציג את תוצאת המשיכה הראשונית ברגע שהיא מסתיימת, בכל מקום באפליקציה.
 *
 * המשיכה הראשונית רצה ברקע: המשתמש מתחיל אותה בהגדרות ויכול לנווט הלאה, ולכן
 * הדיאלוג מותקן פעם אחת ב-app.component (כמו ה-toast הגלובלי) ונשען על
 * GmailSyncStateService שמזהה את סיום הריצה. כשיש סיכום — מוצג הדיאלוג בלבד,
 * בלי toast, כדי שלא תהיה הודעה כפולה על אותו אירוע.
 */
@Component({
  selector: 'app-gmail-import-summary-dialog',
  standalone: true,
  imports: [DialogModule, ButtonComponent, GmailImportSummaryComponent],
  template: `
    @if (syncState.finishedImportSummary(); as summary) {
      <p-dialog
        [header]="summaryHeader"
        [visible]="true"
        [modal]="true"
        [rtl]="true"
        [closable]="false"
        [draggable]="false"
        [resizable]="false"
        [style]="{ width: 'min(440px, 95vw)' }"
        [contentStyle]="{ 'max-height': '60vh', 'overflow-y': 'auto' }">
        <app-gmail-import-summary [summary]="summary" />
        <ng-template pTemplate="footer">
          <div class="gmail-summary-dialog-footer">
            <app-p-button
              [buttonText]="'סגור'"
              [buttonColor]="buttonColor.BLACK"
              [buttonSize]="buttonSize.SMALL"
              (onButtonClicked)="syncState.dismissFinishedImportSummary()"></app-p-button>
          </div>
        </ng-template>
      </p-dialog>
    }
  `,
  styles: [
    `
      .gmail-summary-dialog-footer {
        display: flex;
        justify-content: flex-end;
      }
    `,
  ],
})
export class GmailImportSummaryDialogComponent {
  readonly syncState = inject(GmailSyncStateService);
  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;

  /** כותרת קבועה; מצב ההצלחה/כישלון עצמו מוצג בתוך רכיב הסיכום. */
  readonly summaryHeader = 'משיכת המסמכים מ-Gmail';
}
