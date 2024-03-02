import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';
import { UserCredential } from '@firebase/auth-types';
import { LoadingController } from '@ionic/angular';

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


  constructor(private router: Router, private activatedRoute: ActivatedRoute, private formBuilder: FormBuilder, private authService: AuthService, private loadingController: LoadingController) {

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
    this.authService.isErrLogIn$.subscribe((val) =>{
      if (val === "user") {
        this.displayError = val;
      }
      if (val === "password") {
        this.displayError = "password";
      }
      if (val === "error") {
        this.displayError = "error";
      }
    })
  }

  onEnterKeyPressed(): void {
    this.signin();
  }

  async signin(): Promise<void>{

    const loading = await this.loadingController.create({
      message: 'Please wait...',
      spinner: 'crescent'
    });
    await loading.present();

    const formData = this.myForm.value;
    this.authService.userVerify(formData.userName,formData.password)
    .subscribe((res) => {
      if (res) {
        this.userCredential = res;
      }
      if (res.user.emailVerified) {
        this.authService.signIn(res);
        loading.dismiss();
      }
      else{
        this.displayError = "email";
        loading.dismiss();
      }
    });
  }

  sendVerficaitonEmail(): void {
    this.authService.SendVerificationMail();
  }

  navigateToRegister(): void {
    this.router.navigate(['register'])
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  resetPassword(): void {
    this.authService.ForgotPassword(this.userEmail);
  }

  saveEmailForReset(event: any): void {
    console.log(event);
    this.userEmail = event.target.value;
    console.log(this.userEmail); 
  }
}
