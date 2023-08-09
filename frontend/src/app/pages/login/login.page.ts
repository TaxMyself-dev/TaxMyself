import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import axios from 'axios';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {
  myForm: FormGroup;
  constructor(private formBuilder: FormBuilder, private authService: AuthService) {

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
  }

  handleFormRegister() {
    const formData = this.myForm.value;
    console.log(formData);
  }

  signInWithFireBase() {
    const formData = this.myForm.value;
    this.authService.signInWithEmailAndPassword(formData.userName, formData.password).subscribe();
  
    // const url = "http://localhost:3000/auth/signin";
    // console.log("in sign in firebase", formData.userName, formData.password);

    // console.log("token in login:", this.authService.token);
    // const data = { token: this.authService.token, uid: this.authService.uid };
    // console.log(data.uid);

    // axios.post(url, data)
    //   .then(response => {
    //     // Request was successful, handle the response data.
    //     console.log('Response:', response.data.body);
    //   })
    //   .catch(error => {
    //     // An error occurred during the request.
    //     console.log('Error:', error.response.data.message);
    //     console.error('Error:', error);
    //   });
  }



}
