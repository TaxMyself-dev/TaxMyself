import { Component, OnInit, DestroyRef, inject, signal, computed } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl, AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { LoadingController } from '@ionic/angular';
import { EMPTY, catchError, finalize, firstValueFrom, interval, take, tap } from 'rxjs';
import { ButtonSize } from '../../components/button/button.enum';
import { ButtonColor } from '../../components/button/button.enum';
import { bunnerImagePosition, FormTypes } from 'src/app/shared/enums';
import { GenericService } from 'src/app/services/generic.service';
import { ButtonClass } from 'src/app/shared/button/button.enum';
import { MessageService } from 'primeng/api';
import { Location } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NetworkStatusService } from 'src/app/services/pwa/network-status.service';
import { DEFAULT_AUTHENTICATED_PATH } from 'src/app/shared/auth/default-authenticated-route';
import {
  getAuth,
  GoogleAuthProvider,
  MultiFactorResolver,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { MfaService } from 'src/app/services/mfa.service';
import { environment } from 'src/environments/environment';


@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false,
})
export class LoginPage implements OnInit {

  readonly bunnerImagePosition = bunnerImagePosition;
  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  readonly ButtonClass = ButtonClass;
  readonly formTypes = FormTypes;

  isLoading = signal(false);
  isLoadingStateResetPassword = signal(false);
  userEmailForReset: string = "";
  loginForm: FormGroup;
  resetForm: FormGroup;
  displayError: string;
  showPassword: boolean = false;
  resetMode = false;
  mailAddressForResendAuthMail: string = "";
  passwordForResendAuthMail: string = "";
  isVisibleDialogRegisterMessage: boolean = false;
  showModal = signal<boolean>(false);
  resendCountdown = signal(0);
  mfaChallenge = signal(false);
  mfaError = signal<string | null>(null);
  mfaCode = '';
  private mfaResolver: MultiFactorResolver | null = null;
  private mfaFirstFactor: 'password' | 'google' | null = null;
  isVerificationButtonDisabled = computed(() => this.resendCountdown() > 0);
  private destroyRef = inject(DestroyRef);
  private readonly network = inject(NetworkStatusService);

  constructor(
    private location: Location,
    private messageService: MessageService,
    private route: ActivatedRoute,
    private genericService: GenericService,
    private router: Router,
    public afAuth: AngularFireAuth,
    private formBuilder: FormBuilder,
    public authService: AuthService,
    private loadingController: LoadingController,
    private mfa: MfaService,
  ) {

    this.loginForm = this.formBuilder.group({
      userName: new FormControl(
        '', [Validators.required, Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
      ),
      password: new FormControl(
        '', [Validators.required, Validators.pattern(/^(?=.*[a-zA-Z].*[a-zA-Z])(?=.*\d).{8,}$/)]
      ),
    });

    this.resetForm = this.formBuilder.group({
      userName: new FormControl(
        '', [Validators.required, Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
      )
    });
  }


  ngOnInit() {
    this.getStateData();
  }

  // "Already signed in → go straight into the app" now lives in LoginPageGuard
  // (shared/guard/login-page.guard.ts). Deciding it there means this component
  // is never created for an authenticated user, which is what removes the
  // login-page flash on a cold start with a live session.

  /**
   * Enter the authenticated app — the default page, never a previously
   * visited route — UNLESS a `?ref=<code>` query param is present on /login,
   * in which case this login was the redirect leg of the referral-consent
   * flow (ReferralConsentGuard sent an unauthenticated visitor here) and we
   * complete the round trip back to /referral-consent/:code instead.
   *
   * Resolves only once the router has finished, guards included.
   * `navigateByUrl()` does not resolve early on a guard redirect: Angular
   * chains a redirecting cancellation onto this same promise and settles it
   * when the final destination has been activated. So awaiting it covers
   * BillingGuard's `/billing/me` round trip, the lazy chunk for the target page
   * and the final activation.
   *
   * `false` means a guard refused outright without redirecting, which would
   * strand a signed-in user on /login — surface it instead of silently leaving
   * them there.
   */
  private async enterApp(): Promise<void> {
    const referralCode = this.route.snapshot.queryParamMap.get('ref');
    const target = referralCode ? `/referral-consent/${referralCode}` : DEFAULT_AUTHENTICATED_PATH;
    const entered = await this.router.navigateByUrl(target);
    if (!entered) {
      throw new Error('Post-login navigation was refused by a guard');
    }
  }

  /** Block Firebase login while offline; reuse the existing error slot. */
  private blockIfOffline(): boolean {
    if (this.network.isBrowserOnline()) {
      return false;
    }
    this.authService.error.set('offline');
    this.isLoading.set(false);
    return true;
  }


  getStateData() {
    const state = this.location.getState() as {
      from?: string;
      email?: string;
      password?: string;
      mfaEnrolled?: boolean;
    };

    if (state?.email && state?.password) {
      this.mailAddressForResendAuthMail = state.email;
      this.passwordForResendAuthMail = state.password;
    }

    if (state?.from === 'register') {
      console.log('Navigated to Login Page from Register Page');
      this.showModal.set(true);
    }
    if (state?.mfaEnrolled) {
      this.messageService.add({
        severity: 'success',
        summary: 'האימות הדו־שלבי הופעל',
        detail: 'התחברו מחדש והזינו את הקוד מאפליקציית ה־Authenticator.',
        life: 6000,
        key: 'br',
      });
    }
  }

  closeModal() {
    this.showModal.set(false);
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  onEnterKeyPressed(): void {
    this.login();
  }


  /**
   * The loading state covers the WHOLE login: credential check, auth-state
   * propagation, profile fetch, businesses, and the routed entry into the app
   * (billing + module guards, lazy chunk, activation). It is released only when
   * that finishes or fails — never while the user is still sitting on /login
   * waiting for the app to appear.
   */
  async login(): Promise<void> {
    // A second click while the first login is still running would start a
    // parallel sign-in and a second navigation.
    if (this.isLoading()) {
      return;
    }
    if (this.blockIfOffline()) {
      return;
    }

    this.isLoading.set(true);
    this.authService.error.set(null);
    const formData = this.loginForm.value;
    try {
      const credential = await signInWithEmailAndPassword(
        getAuth(),
        formData.userName,
        formData.password,
      );
      if (!credential.user.emailVerified) {
        this.authService.error.set('email');
        return;
      }
      await this.finishPasswordLogin();
    } catch (err: any) {
      if (this.beginMfaChallenge(err, 'password')) return;
      this.authService.handleErrorLogin(err?.code);
      console.error('❌ Firebase login error:', err);
    } finally {
      this.isLoading.set(false);
    }
  }




  //   async login(): Promise<void> {


  //   this.isLoading.set(true);
  //   this.authService.error.set(null);
  //   const formData = this.loginForm.value;

  //   from(this.afAuth.signInWithEmailAndPassword(formData.userName, formData.password))
  //     .pipe(
  //       catchError((err) => {
  //         console.log("err in user verify in sign in", err);
  //         return EMPTY;
  //       }),
  //       filter((res) => {
  //         if (!res?.user?.emailVerified) {
  //           console.log("res in email error", res);
  //           this.authService.error.set("email");
  //         }
  //         return res?.user?.emailVerified;
  //       }),
  //       switchMap((res) => this.authService.signIn()),
  //       catchError((err) => {
  //         console.log("error in sign-in of login page: ", err);
  //         return EMPTY;
  //       }),
  //       tap((res: any) => {
  //         sessionStorage.setItem('isLoggedIn', 'true');
  //         this.authService.storeUserData(res);
  //         console.log('Sign-in response:', res);

  //          // 🚀 Load businesses immediately after login
  //         await this.genericService.loadBusinessesFromServer();
  //         // 🔥 Load businesses right after successful login
  //         //this.genericService.clearBusinesses
  //         //this.genericService.loadBusinesses();
  //         console.log("after login");

  //         this.router.navigate(['my-account']);
  //       }),
  //       finalize(() => {
  //         console.log("Finalize called - Dismissing loader");
  //         this.isLoading.set(false);
  //       })
  //     )
  //     .subscribe()
  // }


  sendVerficaitonEmail(): void {
    if (this.isVerificationButtonDisabled()) {
      return;
    }

    this.authService.SendVerificationMail(this.mailAddressForResendAuthMail, this.passwordForResendAuthMail)
      .pipe(
        tap(() => {
          this.messageService.add({
            severity: 'info',
            summary: 'Success',
            detail: 'מייל לאימות נשלח לכתובת האימייל שהכנסת',
            life: 3000,
            key: 'br',
          });
        }),
        tap(() => this.startResendCooldown(60)),
        catchError((err) => {
          console.log("error in send verification email: ", err);
          switch (err.code) {
            case "auth/invalid-email":
            case "auth/user-not-found":
              this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: "כתובת האימייל שהכנסת אינה תקינה או לא קיימת במערכת",
                sticky: true,
                key: 'br'
              });
              break;

            case "auth/too-many-requests":
            case "auth/network-request-failed":
            case "auth/operation-not-allowed":
              this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: "אירעה שגיאה בשליחת המייל, אנא נסה מאוחר יותר",
                sticky: true,
                key: 'br'
              });
              break;

            default:
              this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: "אירעה שגיאה לא צפויה",
                sticky: true,
                key: 'br'
              });
          }
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }



  /** Same contract as {@link login}: loading covers everything up to arrival. */
  async googleSignIn(): Promise<void> {
    if (this.isLoading()) {
      return;
    }
    if (this.blockIfOffline()) {
      return;
    }

    this.isLoading.set(true);
    this.authService.error.set(null);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ hl: 'iw' });
      await signInWithPopup(getAuth(), provider);
      await this.finishGoogleLogin();
    } catch (err: any) {
      if (this.beginMfaChallenge(err, 'google')) return;
      console.error('❌ Google sign-in error code:', err?.code, err);
      switch (err?.code) {
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
          break;
        case 'auth/network-request-failed':
          this.authService.error.set('net');
          break;
        case 'auth/popup-blocked':
          this.messageService.add({ severity: 'warn', summary: 'חסימת חלון', detail: 'הדפדפן חסם את חלון הכניסה. אנא אפשר חלונות קופצים לאתר זה.', sticky: true, key: 'br' });
          break;
        default:
          this.authService.error.set('error');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  async verifyMfaCode(): Promise<void> {
    if (!this.mfaResolver || !this.mfaFirstFactor || !/^\d{6}$/.test(this.mfaCode.trim())) {
      return;
    }
    this.isLoading.set(true);
    this.mfaError.set(null);
    try {
      await this.mfa.resolveTotpSignIn(this.mfaResolver, this.mfaCode);
      const firstFactor = this.mfaFirstFactor;
      this.clearMfaChallenge();
      if (firstFactor === 'google') {
        await this.finishGoogleLogin();
      } else {
        await this.finishPasswordLogin();
      }
    } catch (error) {
      console.error('MFA verification failed', error);
      this.mfaError.set('הקוד שהוזן אינו תקין. המתינו לקוד הבא ונסו שוב.');
    } finally {
      this.isLoading.set(false);
    }
  }

  cancelMfaChallenge(): void {
    this.clearMfaChallenge();
    void this.afAuth.signOut();
  }

  private beginMfaChallenge(error: unknown, firstFactor: 'password' | 'google'): boolean {
    if (!this.mfa.isChallengeError(error)) return false;
    try {
      this.mfaResolver = this.mfa.resolverFrom(error);
      this.mfaFirstFactor = firstFactor;
      this.mfaCode = '';
      this.mfaError.set(null);
      this.mfaChallenge.set(true);
      return true;
    } catch (resolverError) {
      console.error('Unable to initialize MFA challenge', resolverError);
      return false;
    }
  }

  private clearMfaChallenge(): void {
    this.mfaChallenge.set(false);
    this.mfaResolver = null;
    this.mfaFirstFactor = null;
    this.mfaCode = '';
    this.mfaError.set(null);
  }

  private async finishPasswordLogin(): Promise<void> {
    if (await this.routeToEnrollmentWhenRequired()) return;
    await this.authService.waitForAuthenticatedUser();
    const userData: any = await firstValueFrom(this.authService.signIn(true));
    this.authService.storeUserData(userData);
    await this.genericService.loadBusinessesFromServer();
    await this.enterApp();
  }

  private async finishGoogleLogin(): Promise<void> {
    if (await this.routeToEnrollmentWhenRequired()) return;
    const { isNewUser, userData } =
      await this.authService.completeGoogleSignInForCurrentUser();
    if (isNewUser) {
      await this.afAuth.signOut();
      this.messageService.add({
        severity: 'warn',
        summary: 'משתמש לא רשום',
        detail: 'אין חשבון רשום עם כתובת האימייל הזו. יש להירשם תחילה.',
        sticky: true,
        key: 'br',
      });
      return;
    }
    await this.authService.waitForAuthenticatedUser();
    this.authService.storeUserData(userData);
    await this.genericService.loadBusinessesFromServer();
    await this.enterApp();
  }

  private async routeToEnrollmentWhenRequired(): Promise<boolean> {
    if (!environment.requireMfa) return false;
    const state = await this.mfa.sessionState();
    if (state === 'NOT_ENROLLED') {
      await this.router.navigateByUrl('/mfa/setup');
      return true;
    }
    if (state !== 'VERIFIED') {
      throw new Error('Second-factor proof is missing from the Firebase session');
    }
    return false;
  }

  navigateToRegister(): void {
    this.router.navigate(['register'])
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  switchMode(isResetMode: boolean): void {
    this.resetMode = isResetMode;
  }

  resetPassword(): void {
    this.isLoadingStateResetPassword.set(true);
    this.authService.ForgotPassword(this.loginForm.get('userName')?.value)
      .pipe(
        catchError((err) => {
          console.log("err in reset: ", err);
          switch (err.code) {
            case "auth/invalid-email":
            case "auth/user-not-found":
            case "auth/missing-email":
              this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: "כתובת האימייל שהכנסת אינה תקינה או לא קיימת במערכת",
                //life: 3000,
                sticky: true,
                key: 'br'
              })
              break;
            case "auth/too-many-requests":
            case "auth/network-request-failed":
            case "auth/operation-not-allowed":
              this.messageService.add({
                severity: 'error',
                summary: 'Error',
                detail: "אירעה שגיאה בשליחת המייל, אנא נסה מאוחר יותר",
                //life: 3000,
                sticky: true,
                key: 'br'
              })
          }

          return EMPTY;
        }),
        finalize(() => this.isLoadingStateResetPassword.set(false)),
      ).subscribe(() => {
        this.messageService.add({
          severity: 'info',
          summary: 'Success',
          detail: "מייל לאימות סיסמא נשלח לכתובת האימייל שהכנסת",
          // life: 3000,
          sticky: true,
          key: 'br'
        })
      });
  }

  private startResendCooldown(seconds: number): void {
    this.resendCountdown.set(seconds);

    interval(1000)
      .pipe(
        take(seconds),
        tap((elapsed) => this.resendCountdown.set(seconds - 1 - elapsed)),
        finalize(() => this.resendCountdown.set(0)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe();
  }
}
