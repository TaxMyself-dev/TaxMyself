import { Component, OnInit, NgModule } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { RegisterService } from './register.service';
import { IChildren } from 'src/app/shared/interface';
import axios from 'axios';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
})
export class RegisterPage implements OnInit {

  myForm: FormGroup;
  children: IChildren[] = [{ name: "", dateOfBirth: "" }];
  selectedOption!: string;
  today!: string;
  passwordValid = true;
  passwordValidInput!: string;



  

  constructor(private formBuilder: FormBuilder, private registerService: RegisterService) {
    const currentDate = new Date();
    this.today = currentDate.toISOString().substring(0, 10);

    this.myForm = this.formBuilder.group({
      fName: new FormControl(
        '', Validators.required,
      ),
      lName: new FormControl(
        '', Validators.required,
      ),
      id: new FormControl(
        '', [Validators.required,Validators.pattern(/^\d{9}$/)]
      ),
      email: new FormControl(
        '', [Validators.required,Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
      ),
      phone: new FormControl(
        '',[Validators.required,Validators.pattern(/^\d{10}$/)]
      ),
      dateOfBirth: new FormControl(
        '', Validators.required,
      ),
      userName: new FormControl(
        '', Validators.required,
      ),
      password: new FormControl(
        '',[Validators.required,Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/)]
      ),
      children: new FormControl(
        [], Validators.requiredTrue,
      ),
      spouseFName: new FormControl(
        '', Validators.required,
      ),
      spouseId: new FormControl(
        '', Validators.pattern(/^\d{9}$/),
      ),
      spouseDateOfBirth: new FormControl(
        '', Validators.required,
      ),
      Independent: new FormControl(
        false, Validators.requiredTrue,
      ),

    });
  }


  ngOnInit() {
  };

  
  addChild() {
    this.children = [...this.children, { name: '', dateOfBirth: '' }];
  }

  removeChild(index: number) {
    if (this.children.length > 1)
      this.children.splice(index, 1);
  }

  handleFormRegister() {
    const formData = this.myForm.value;
    console.log("form  data:",formData.password);
    console.log(this.myForm.get('password')?.value);
    console.log(this.myForm.get('email')?.value);
    const url = "http://localhost:3000/auth/signup";
    const data = {password:formData.password,email:formData.email};
    console.log(data);
    
    //axios.post("http://localhost:3000/auth/signup",this.myForm.get('password')?.value);
    axios.post(url, data)
  .then(response => {
    // Request was successful, handle the response data.
    console.log('Response:', response.data);
  })
  .catch(error => {
    // An error occurred during the request.
    console.log('Error:', error.response.data.message);
    console.error('Error:', error);
    
  });
  }

  saveChildName(data: any, index: number) {
    this.children[index].name = data.target.value;
    this.myForm.get('children')?.setValue(this.children);
  }

  saveChildDate(data: any, index: number) {
    this.children[index].dateOfBirth = data.target.value;
    this.myForm.get('children')?.setValue(this.children);
  }

  onOptionChange(event: any) {
    this.selectedOption = event.target.value
  }

  changePasswordValidinput(event : any){
    this.passwordValidInput = event.target.value;
    console.log(this.passwordValidInput);
  }

  checkPassword(){
   const realPass = this.myForm.get('password')?.value;
   console.log(realPass);
   if (this.passwordValidInput === realPass){
    this.passwordValid = true;
   }else{
    this.passwordValid = false;
   }
  }
}
