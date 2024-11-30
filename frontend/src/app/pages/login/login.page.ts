import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { UserCredential } from '@firebase/auth-types';
import { LoadingController } from '@ionic/angular';
import { EMPTY, catchError, finalize } from 'rxjs';
import { ButtonSize } from 'src/app/shared/button/button.enum';
import { FormTypes } from 'src/app/shared/enums';

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
  userCredential: UserCredential;
  loginForm: FormGroup;
  resetForm: FormGroup;
  displayError: string;
  showPassword: boolean = false;
  isToastOpen: boolean = false;
  messageToast: string = "";
  resetMode = false;

  constructor(private router: Router, private formBuilder: FormBuilder, public authService: AuthService, private loadingController: LoadingController) {

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
  }

  onEnterKeyPressed(): void {
    this.signin();
  }

  async signin(): Promise<any> {
    if (this.loginForm.valid) {
      const loading = await this.loadingController.create({
        message: 'Please wait...',
        spinner: 'crescent'
      });
      await loading.present();
      const formData = this.loginForm.value;
      this.authService.userVerify(formData.userName, formData.password)
      .pipe(
        catchError((err) => {
          console.log("err in user verify in sign in", err);
          return EMPTY;
        }),
        finalize(() => loading.dismiss()),
        )
        .subscribe((res) => {
          if (res) {
            this.userCredential = res;
          }
          if (res.user.emailVerified) {
            this.authService.signIn(res)
              .subscribe((res) => {
                localStorage.setItem('userData', JSON.stringify(res));
                  this.router.navigate(['my-account']);
              })
          }
          else {
            this.authService.error$.next("email");
          }
        });
      }
  }

  sendVerficaitonEmail(): void {
    this.authService.SendVerificationMail()
    .subscribe (() => {
      this.messageToast = "מייל לאימות סיסמא נשלח לכתובת האימייל שהכנסת"
      this.isToastOpen = true;
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
      this.messageToast = "קישור לאיפוס סיסמא נשלח אליך למייל";
      this.isToastOpen =true;
    });
  }
  else {
    alert("אנא הכנס אימייל תקין");
  }
}

  setOpenToast(): void {
    this.isToastOpen = false;
  }

  saveEmailForReset(email: string): void {
    this.userEmailForReset = email;
  }
}
