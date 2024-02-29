import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import axios from 'axios';
import { AuthService } from 'src/app/services/auth.service';
import { UserCredential } from '@firebase/auth-types';
import {  sendEmailVerification,} from '@angular/fire/auth';

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


  constructor(private router: Router, private activatedRoute: ActivatedRoute, private formBuilder: FormBuilder, private authService: AuthService) {

    this.myForm = this.formBuilder.group({

      userName: new FormControl(
        '', Validators.required,
      ),
      password: new FormControl(
        '', Validators.required,
      ),
    });
  }

  ngOnInit() {
    this.activatedRoute.queryParams.subscribe( params => {
      this.emailVerify = params['fromReg']
      this.userEmail = params['email']
      console.log(this.emailVerify);
      console.log(this.userEmail);
    })
  }

  signin(){
    console.log(this.myForm);
    
    const formData = this.myForm.value;
    this.authService.userVerify(formData.userName,formData.password)
    .subscribe((res) => {
      if (res) {
        console.log("res: ", res);
        
        this.userCredential = res;
      }
      if (res.user.emailVerified) {
        this.authService.signIn(res);
        console.log(res)
      
      }
      else{
        this.emailVerify = res.user.emailVerified;
        alert("please verify email");
        console.log(res);
        
      }
    });
  }

  sendVerficaitonEmail(): void {
    this.authService.SendVerificationMail();
  }

  navigateToRegister(): void {
    this.router.navigate(['register'])
  }


}
