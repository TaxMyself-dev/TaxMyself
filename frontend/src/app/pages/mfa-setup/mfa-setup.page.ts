import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { RecaptchaVerifier } from 'firebase/auth';
import { MfaService } from '../../services/mfa.service';

@Component({
  selector: 'app-mfa-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './mfa-setup.page.html',
  styleUrls: ['./mfa-setup.page.scss'],
})
export class MfaSetupPage implements OnInit, OnDestroy {
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly smsSent = signal(false);
  readonly maskedPhone = signal('');
  phoneNumber = '';
  consent = false;
  code = '';
  private verificationId: string | null = null;
  private recaptcha: RecaptchaVerifier | null = null;

  constructor(
    private readonly mfa: MfaService,
    private readonly router: Router,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const state = await this.mfa.sessionState();
      if (state === 'SIGNED_OUT' || state === 'VERIFICATION_REQUIRED') {
        await this.router.navigateByUrl('/login');
        return;
      }
      if (state === 'VERIFIED') {
        await this.router.navigateByUrl('/my-account');
        return;
      }
    } catch (error) {
      console.error('MFA enrollment initialization failed', error);
      this.error.set('לא הצלחנו להתחיל את הגדרת האימות הדו־שלבי.');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    this.clearRecaptcha();
  }

  async sendCode(): Promise<void> {
    if (!this.consent || this.sending()) return;
    this.error.set(null);
    this.sending.set(true);
    try {
      const normalized = this.mfa.normalizePhoneNumber(this.phoneNumber);
      this.clearRecaptcha();
      this.recaptcha = this.mfa.createInvisibleRecaptcha('mfa-enrollment-recaptcha');
      this.verificationId = await this.mfa.sendEnrollmentSms(
        normalized,
        this.recaptcha,
      );
      this.maskedPhone.set(`***${normalized.slice(-4)}`);
      this.smsSent.set(true);
    } catch (error: any) {
      console.error('MFA SMS enrollment send failed', error);
      this.error.set(this.smsErrorMessage(error));
      this.clearRecaptcha();
    } finally {
      this.sending.set(false);
    }
  }

  async completeEnrollment(): Promise<void> {
    if (!this.verificationId || !/^\d{6}$/.test(this.code.trim()) || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.mfa.completeSmsEnrollment(this.verificationId, this.code);
      await this.router.navigate(['/login'], {
        state: { mfaEnrolled: true },
      });
    } catch (error) {
      console.error('MFA enrollment verification failed', error);
      this.error.set('הקוד שהוזן אינו תקין או שפג תוקף ההגדרה. נסו שוב.');
    } finally {
      this.submitting.set(false);
    }
  }

  private clearRecaptcha(): void {
    this.recaptcha?.clear();
    this.recaptcha = null;
  }

  private smsErrorMessage(error: any): string {
    switch (error?.code) {
      case 'auth/invalid-phone-number':
        return 'מספר הטלפון אינו תקין. הזינו מספר ישראלי או מספר בינלאומי מלא.';
      case 'auth/too-many-requests':
      case 'auth/quota-exceeded':
        return 'לא ניתן לשלוח כרגע קוד נוסף. המתינו ונסו שוב מאוחר יותר.';
      default:
        return 'לא הצלחנו לשלוח קוד SMS. בדקו את המספר ונסו שוב.';
    }
  }
}
