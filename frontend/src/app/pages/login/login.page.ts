import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup , Validators, FormControl} from '@angular/forms';
import axios from 'axios';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {
  myForm: FormGroup;
  constructor(private formBuilder: FormBuilder) {
    
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

  handleFormRegister(){
    const formData = this.myForm.value;
    console.log(formData);    
  }

}
