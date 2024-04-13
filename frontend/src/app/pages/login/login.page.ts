import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { UserCredential } from '@firebase/auth-types';
import { LoadingController } from '@ionic/angular';
import { EMPTY, Subject, catchError, finalize } from 'rxjs';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],

})
export class LoginPage implements OnInit {

  emailVerify: boolean = true;
  userEmail: string = "";
  userCredential: UserCredential;
  myForm: FormGroup;
  displayError: string;
  showPassword: boolean = false;
  isToastOpen: boolean = false;
  messageToast: string = "";


  constructor(private router: Router, private activatedRoute: ActivatedRoute, private formBuilder: FormBuilder, public authService: AuthService, private loadingController: LoadingController) {

    this.myForm = this.formBuilder.group({

      userName: new FormControl(
        '', [Validators.required,]
      ),
      password: new FormControl(
        '', [Validators.required, Validators.pattern(/^(?=.*[a-zA-Z].*[a-zA-Z])(?=.*\d).{8,}$/)]
      ),
    });
  }

  ngOnInit() {
  }

  onEnterKeyPressed(): void {
    this.signin();
  }

  async signin(): Promise<any> {

    const loading = await this.loadingController.create({
      message: 'Please wait...',
      spinner: 'crescent'
    });
    await loading.present();

    const formData = this.myForm.value;
    this.authService.userVerify(formData.userName, formData.password)
    .pipe(
      catchError((err) => {
        console.log("err in user verify in sign in", err);
        return EMPTY;
      }),
      finalize(() => loading.dismiss()),
      )
      .subscribe((res) => {
        console.log("res sign in", res);

        if (res) {
          this.userCredential = res;
        }
        if (res.user.emailVerified) {
          this.authService.signIn(res)
            .subscribe((res) => {
              console.log("res from server",res);
              this.authService.userDetails = res;
              this.router.navigate(['my-account']);
            })
        }
        else {
          this.authService.error$.next("email");
        }
      });
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

  resetPassword(): void {
    this.authService.ForgotPassword(this.userEmail)
    .pipe(
      catchError((err) => {
        console.log("err in reset: ", err);
        switch (err.code) {
          case "auth/invalid-email":
          case "auth/user-not-found":
            // this.isErrLogIn$.next("user");
            this.authService.error$.next("user");
            break;
          case "auth/too-many-requests":
          case "auth/network-request-failed":
          case "auth/operation-not-allowed":
            // this.isErrLogIn$.next("error")
            this.authService.error$.next("error");
        }

        return EMPTY;
      })
    ).subscribe(() => {
      this.messageToast = "קישור לאיפוס סיסמא נשלח אליך למייל";
      this.isToastOpen =true;
    });
  }

  setOpenToast(): void {
    this.isToastOpen = false;
  }

  saveEmailForReset(event: any): void {
    this.userEmail = event.target.value;
  }
}
