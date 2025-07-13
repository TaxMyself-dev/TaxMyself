import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl, AbstractControl } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
// import { UserCredential } from '@firebase/auth-types';
import { LoadingController } from '@ionic/angular';
import { EMPTY, catchError, filter, finalize, from, switchMap, tap } from 'rxjs';
import { ButtonSize } from '../../components/button/button.enum';
import { ButtonColor } from '../../components/button/button.enum';
import { bunnerImagePosition, FormTypes } from 'src/app/shared/enums';
import { GenericService } from 'src/app/services/generic.service';
import { ButtonClass } from 'src/app/shared/button/button.enum';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: false
})
export class LoginPage implements OnInit {

  readonly bunnerImagePosition = bunnerImagePosition;
  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  readonly ButtonClass = ButtonClass;
  readonly formTypes = FormTypes;

  isLoading = signal(false);
  isLoadingStateResetPassword = signal(false);
  // emailVerify: boolean = true;
  userEmailForReset: string = "";
  //userCredential: UserCredential;
  loginForm: FormGroup;
  resetForm: FormGroup;
  displayError: string;
  showPassword: boolean = false;
  resetMode = false;
  // isLoading = false;

  constructor(private messageService: MessageService, private route: ActivatedRoute, private genericService: GenericService, private router: Router, private formBuilder: FormBuilder, public authService: AuthService, private loadingController: LoadingController) {

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
    this.route.queryParams.subscribe(params => {
      if (params['from'] === 'register') {
        console.log('Navigated to Login Page from Register Page');
        this.authService.error.set('email');
        // alert('בסיום ההרשמה נשלח לחשבון הדוא"ל שלך מייל לאימות אנא ודן כי אישרת אותו')
      }
    });
  }




  togglePassword() {
    this.showPassword = !this.showPassword;
  }

  onEnterKeyPressed(): void {
    this.login2();
  }

  login2(): void {
    this.isLoading.set(true);
    this.authService.error.set(null);
    const formData = this.loginForm.value;
    // this.genericService.getLoader()
    this.authService.userVerify(formData.userName, formData.password)
      .pipe(
        // switchMap(() => from(this.authService.userVerify(formData.userName, formData.password))),
        catchError((err) => {
          console.log("err in user verify in sign in", err);
          return EMPTY;
        }),
        filter((res) => {
          if (!res?.user?.emailVerified) {
            console.log("in email error");
            // this.genericService.dismissLoader();
            this.authService.error.set("email");
          }
          return res?.user?.emailVerified;
        }),
        switchMap((res) => this.authService.signIn(res)),
        catchError((err) => {
          console.log("error in sign-in of login page: ", err);
          return EMPTY;
        }),
        tap((res) => {
          localStorage.setItem('userData', JSON.stringify(res));
          console.log('Sign-in response:', res);
          this.router.navigate(['my-account']);
          // this.isLoadingfalse;
          // this.genericService.dismissLoader();// TODO: why finlize is not called after succeeded
        }),
        finalize(() => {
          console.log("Finalize called - Dismissing loader");
          this.isLoading.set(false);
          // this.genericService.dismissLoader();
        })

      )
      .subscribe()
  }

  sendVerficaitonEmail(): void {
    this.authService.SendVerificationMail()
      .pipe(
        catchError((err) => {
          console.log("error in send verification email: ", err);
          switch (err.code) {
            case "auth/invalid-email":
            case "auth/user-not-found":
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
        }
        )
      )
      .subscribe((res) => {
        console.log("Verification email sent successfully: ", res);

        this.messageService.add({
          severity: 'info',
          summary: 'Success',
          detail: "מייל לאימות סיסמא נשלח לכתובת האימייל שהכנסת",
          life: 3000,
          key: 'br'
        })
      })
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
}
