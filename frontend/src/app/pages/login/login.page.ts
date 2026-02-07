import { Component, OnInit, DestroyRef, inject, signal, computed } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl, AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { LoadingController } from '@ionic/angular';
import { EMPTY, catchError, filter, finalize, from, interval, switchMap, take, tap } from 'rxjs';
import { ButtonSize } from '../../components/button/button.enum';
import { ButtonColor } from '../../components/button/button.enum';
import { bunnerImagePosition, FormTypes } from 'src/app/shared/enums';
import { GenericService } from 'src/app/services/generic.service';
import { ButtonClass } from 'src/app/shared/button/button.enum';
import { MessageService } from 'primeng/api';
import { Location } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';


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
  isVerificationButtonDisabled = computed(() => this.resendCountdown() > 0);
  private destroyRef = inject(DestroyRef);

  constructor(
    private location: Location,
    private messageService: MessageService,
    private route: ActivatedRoute,
    private genericService: GenericService,
    private router: Router,
    public afAuth: AngularFireAuth,
    private formBuilder: FormBuilder,
    public authService: AuthService,
    private loadingController: LoadingController
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


  getStateData() {
    const state = this.location.getState() as {
      from?: string;
      email?: string;
      password?: string;
    };

    if (state?.email && state?.password) {
      this.mailAddressForResendAuthMail = state.email;
      this.passwordForResendAuthMail = state.password;
    }

    if (state?.from === 'register') {
      console.log('Navigated to Login Page from Register Page');
      this.showModal.set(true);
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


  login(): void {

    this.isLoading.set(true);
    this.authService.error.set(null);
    const formData = this.loginForm.value;

    from(this.afAuth.signInWithEmailAndPassword(formData.userName, formData.password))
      .pipe(
        catchError((err) => {
          this.authService.handleErrorLogin(err.code);
          console.log("❌ Firebase login error:", err);
          return EMPTY;
        }),

        // 1️⃣ Validate email
        filter((res) => {
          if (!res?.user?.emailVerified) {
            this.authService.error.set("email");
          }
          return res?.user?.emailVerified;
        }),

        // 2️⃣ Call your backend signIn()
        switchMap(() => this.authService.signIn()),

        catchError((err) => {
          if (err.status === 0) {
            this.authService.error.set("net");

          }
          else if (err.status === 404) {
            this.authService.error.set("user");
          }
          else {
            this.authService.error.set("error");
          }

          console.log("❌ Backend sign-in error:", err);
          return EMPTY;
        }),

      // 3️⃣ Save user data
      tap((res: any) => {
        sessionStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userData', JSON.stringify(res));
      }),

        // 4️⃣ Load businesses from server
        switchMap(() =>
          from(this.genericService.loadBusinessesFromServer())
        ),

      // 5️⃣ After businesses loaded → navigate
      tap(() => {
        this.router.navigate(['my-account']);
      }),

        finalize(() => this.isLoading.set(false))
      )
      .subscribe();
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
  //         localStorage.setItem('userData', JSON.stringify(res));
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
