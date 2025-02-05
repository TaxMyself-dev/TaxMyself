import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
// import { UserCredential } from '@firebase/auth-types';
import { LoadingController } from '@ionic/angular';
import { EMPTY, catchError, filter, finalize, from, switchMap, tap } from 'rxjs';
import { ButtonSize } from 'src/app/shared/button/button.enum';
import { FormTypes } from 'src/app/shared/enums';
import { GenericService } from 'src/app/services/generic.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],

})
export class LoginPage implements OnInit {
  readonly ButtonSize = ButtonSize;
  readonly formTypes = FormTypes;

  // emailVerify: boolean = true;
  userEmailForReset: string = "";
  //userCredential: UserCredential;
  loginForm: FormGroup;
  resetForm: FormGroup;
  displayError: string;
  showPassword: boolean = false;
  resetMode = false;
  isLoading = false;

  constructor(private route: ActivatedRoute, private genericService: GenericService, private router: Router, private formBuilder: FormBuilder, public authService: AuthService, private loadingController: LoadingController) {

    this.loginForm = this.formBuilder.group({
      userName: new FormControl(
        '', [Validators.required, Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
      ),
      password: new FormControl(
        '', [Validators.required, Validators.pattern(/^(?=.*[a-zA-Z].*[a-zA-Z])(?=.*\d).{8,}$/)]
      )
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
        this.authService.error$.next('email');
        // alert('בסיום ההרשמה נשלח לחשבון הדוא"ל שלך מייל לאימות אנא ודן כי אישרת אותו')
      }
    });
  }

  onEnterKeyPressed(): void {
    this.login2();
  }

  login2(): void {
    this.isLoading = true;
    this.authService.error$.next(null);
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
            this.authService.error$.next("email");
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
          this.isLoading = false;
          // this.genericService.dismissLoader();// TODO: why finlize is not called after succeeded
        }),
        finalize(() => {
          console.log("Finalize called - Dismissing loader");
          this.isLoading = false;
          // this.genericService.dismissLoader();
        })
       
      )
      .subscribe()
  }

  sendVerficaitonEmail(): void {
    this.authService.SendVerificationMail()
      .subscribe(() => {
        this.genericService.showToast("מייל לאימות סיסמא נשלח לכתובת האימייל שהכנסת", "success")
        // this.messageToast = "מייל לאימות סיסמא נשלח לכתובת האימייל שהכנסת"
        // this.isToastOpen = true;
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
    if (this.resetForm.valid) {
      this.authService.ForgotPassword(this.userEmailForReset)
        .pipe(
          catchError((err) => {
            console.log("err in reset: ", err);
            switch (err.code) {
              case "auth/invalid-email":
              case "auth/user-not-found":
                this.authService.error$.next("user");
                break;
              case "auth/too-many-requests":
              case "auth/network-request-failed":
              case "auth/operation-not-allowed":
                this.authService.error$.next("error");
            }

            return EMPTY;
          })
        ).subscribe(() => {
          this.genericService.showToast("קישור לאיפוס סיסמא נשלח אליך למייל", "success")
          // this.messageToast = "קישור לאיפוס סיסמא נשלח אליך למייל";
          // this.isToastOpen =true;
        });
    }
    else {
      alert("אנא הכנס אימייל תקין");
    }
  }

  // setOpenToast(): void {
  //   this.isToastOpen = false;
  // }

  saveEmailForReset(email: string): void {
    this.userEmailForReset = email;
  }
}
