import { CommonModule } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { TotpSecret } from 'firebase/auth';
import { MfaService } from '../../services/mfa.service';

@Component({
  selector: 'app-mfa-setup',
  standalone: true,
  imports: [CommonModule, FormsModule, IonicModule],
  templateUrl: './mfa-setup.page.html',
  styleUrls: ['./mfa-setup.page.scss'],
})
export class MfaSetupPage implements OnInit {
  readonly loading = signal(true);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly secretKey = signal('');
  code = '';
  private secret: TotpSecret | null = null;

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
      const details = await this.mfa.beginTotpEnrollment();
      this.secret = details.secret;
      this.secretKey.set(details.secretKey);
    } catch (error) {
      console.error('MFA enrollment initialization failed', error);
      this.error.set('לא הצלחנו להתחיל את הגדרת האימות הדו־שלבי.');
    } finally {
      this.loading.set(false);
    }
  }

  async completeEnrollment(): Promise<void> {
    if (!this.secret || !/^\d{6}$/.test(this.code.trim()) || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      await this.mfa.completeTotpEnrollment(this.secret, this.code);
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
}
