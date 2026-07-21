import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import {
  GmailImportAccountSummary,
  GmailImportSummary,
} from 'src/app/services/integrations.service';

/** הצלחה מלאה / הצלחה חלקית / כישלון — קובע כותרת, אייקון וצבע. */
export type GmailImportOutcome = 'success' | 'partial' | 'failure';

/**
 * סיכום משיכת מסמכים מ-Gmail — רכיב תצוגה משותף לשני המסלולים:
 * המשיכה הראשונית (שרצה ברקע ותוצאתה מגיעה דרך sync-status) והמשיכה הידנית
 * (שתוצאתה חוזרת ישירות מה-POST). שניהם מקבלים בדיוק אותו מודל מהשרת, ולכן
 * מוצגים כאן באותו קוד — אין שתי גרסאות של אותו טקסט.
 *
 * הרכיב לא יודע דבר על אחסון פנימי: הוא מציג שמות עסק בלבד.
 */
@Component({
  selector: 'app-gmail-import-summary',
  templateUrl: './gmail-import-summary.component.html',
  styleUrls: ['./gmail-import-summary.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class GmailImportSummaryComponent {
  readonly summary = input.required<GmailImportSummary>();

  readonly outcome = computed<GmailImportOutcome>(() => {
    const summary = this.summary();
    const failedAccounts = summary.perAccount.filter((a) => a.errorCode).length;
    if (failedAccounts > 0 && failedAccounts === summary.perAccount.length) return 'failure';
    if (failedAccounts > 0 || summary.totalFailed > 0) return 'partial';
    return 'success';
  });

  readonly title = computed(() => {
    switch (this.outcome()) {
      case 'failure':
        return 'משיכת המסמכים נכשלה';
      case 'partial':
        return 'משיכת המסמכים הסתיימה חלקית';
      default:
        return 'משיכת המסמכים הסתיימה';
    }
  });

  /** שורות הסיכום המצטבר, לפי סדר התצוגה. שורות עם 0 אינן מוצגות. */
  readonly lines = computed<string[]>(() => {
    const summary = this.summary();
    const lines: string[] = [];

    if (summary.totalImported === 0) {
      lines.push('לא נמצאו מסמכים חדשים.');
    } else if (summary.totalImported === 1) {
      lines.push('נשמר מסמך חדש אחד');
    } else {
      lines.push(`נשמרו ${summary.totalImported} מסמכים חדשים`);
    }

    if (summary.totalAlreadyImported === 1) {
      lines.push('מסמך אחד כבר היה קיים');
    } else if (summary.totalAlreadyImported > 1) {
      lines.push(`${summary.totalAlreadyImported} מסמכים כבר היו קיימים`);
    }

    if (summary.totalSkippedIrrelevant === 1) {
      lines.push('קובץ אחד דולג (אינו קבלה או חשבונית)');
    } else if (summary.totalSkippedIrrelevant > 1) {
      lines.push(`${summary.totalSkippedIrrelevant} קבצים דולגו (אינם קבלה או חשבונית)`);
    }

    if (summary.totalFailed === 1) {
      lines.push('קובץ אחד לא נקלט');
    } else if (summary.totalFailed > 1) {
      lines.push(`${summary.totalFailed} קבצים לא נקלטו`);
    }

    return lines;
  });

  /**
   * "המסמכים נשמרו תחת העסק: ...". null כשלא טופל אף מסמך — במקרה כזה אין
   * עסק אמיתי לדווח עליו, ועדיף לשתוק מאשר לנחש.
   */
  readonly businessText = computed(() => {
    const names = this.summary()
      .destinations.map((d) => d.businessName?.trim())
      .filter((name): name is string => !!name);
    if (names.length === 0) return null;
    return names.length === 1
      ? `המסמכים נשמרו תחת העסק: ${names[0]}`
      : `המסמכים נשמרו תחת העסקים: ${names.join(', ')}`;
  });

  /** פירוט לפי חשבון — רלוונטי רק כשהתבצעה משיכה מיותר מחשבון אחד. */
  readonly showPerAccount = computed(() => this.summary().perAccount.length > 1);

  accountText(account: GmailImportAccountSummary): string {
    if (account.errorCode === 'ACCOUNT_NEEDS_RECONNECT') {
      return 'החיבור לחשבון פג — יש לחבר אותו מחדש';
    }
    if (account.errorCode) {
      return 'לא הצלחנו למשוך מחשבון זה';
    }
    const parts = [
      account.imported === 1 ? 'מסמך חדש אחד' : `${account.imported} מסמכים חדשים`,
    ];
    if (account.alreadyImported > 0) parts.push(`${account.alreadyImported} כבר היו קיימים`);
    if (account.failed > 0) parts.push(`${account.failed} לא נקלטו`);
    return parts.join(' · ');
  }
}
