import { Component, OnInit, NgModule } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { RegisterService } from './register.service';
import { IChildren } from 'src/app/shared/interface';
import axios from 'axios';
import { AuthService } from 'src/app/services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
})
export class RegisterPage implements OnInit {

  myForm: FormGroup;
  children: IChildren[] = [{ fName: "", lName: "", id: "", dateOfBirth: "" }];
  selectedOption!: string;
  today!: string;
  registerMode: boolean = true;
  passwordValid = true;
  passwordValidInput!: string;
  listBusinessField = [{key:"build", value:"בניין"},{key:"electric", value:"חשמל"}, {key:"photo", value:"צילום"}, {key:"architecture", value:"אדריכלות"}]
  listBusinessType = [{key:"licensed", value:"עוסק מורשה"}, {key:"exempt", value:"עוסק פטור"}, {key:"company", value:"חברה"}]




  constructor(private router: Router, private authService: AuthService, private formBuilder: FormBuilder, private registerService: RegisterService) {
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
        '', [Validators.required, Validators.pattern(/^\d{9}$/)]
      ),
      email: new FormControl(
        '', [Validators.required, Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
      ),
      phone: new FormControl(
        '', [Validators.required, Validators.pattern(/^\d{10}$/)]
      ),
      dateOfBirth: new FormControl(
        '', Validators.required,
      ),
      password: new FormControl(
        '', [Validators.required, Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).{8,}$/)]
      ),
      children: new FormControl(
        [], Validators.requiredTrue,
      ),
      haveChild: new FormControl(
        false, Validators.required,
      ),
      spouseFName: new FormControl(
        '', Validators.required,
      ),
      spouseLName: new FormControl(
        '', Validators.required,
      ),
      spouseId: new FormControl(
        '', Validators.pattern(/^\d{9}$/),
      ),
      spouseDateOfBirth: new FormControl(
        '', Validators.required,
      ),
      spouseIndependet: new FormControl(
        false, Validators.requiredTrue,
      ),
      businessType: new FormControl(
        '', Validators.required,
      ),
      businessField: new FormControl(
        '', Validators.required,
      ),
      businessName: new FormControl(
        '', Validators.required,
      ),
      employee: new FormControl(
        false, Validators.requiredTrue,
      ),
      city: new FormControl(
        '', Validators.required,
      ),
    });
  }


  ngOnInit() {
    this.authService.isVerfyEmail$.subscribe((value)=>{//TODO: unsubscribe
      if (value){
        this.registerMode = false;
      }
    })
  };


  addChild() {
    this.children = [...this.children, {  fName: "", lName: "", id: "", dateOfBirth: ""  }];
  }

  removeChild(index: number) {
    if (this.children.length > 1)
      this.children.splice(index, 1);
  }

  async handleFormRegister() {
    const formData = this.myForm.value;
    const data = {fromReg: false, email: formData.email};
    formData.spouseIndependet == "true" ? formData.spouseIndependet = true : formData.spouseIndependet = false
    formData.employee == "true" ? formData.employee = true : formData.employee = false
    console.log(formData);
    
    this.authService.SignUp(formData);
    this.router.navigate(['login'],{queryParams: data});
  }

  saveFirstNameChild(data: any, index: number) {
    this.children[index].fName = data.target.value;
    this.myForm.get('children')?.setValue(this.children);
  }

  saveLastNameChild(data: any, index: number) {
    this.children[index].lName = data.target.value;
    this.myForm.get('children')?.setValue(this.children);
  }

  saveIdChild(data: any, index: number) {
    this.children[index].id = data.target.value;
    this.myForm.get('children')?.setValue(this.children);
  }
  
  saveChildDate(data: any, index: number) {
    this.children[index].dateOfBirth = data.target.value;
    this.myForm.get('children')?.setValue([this.children]);
  }
  
  onOptionChange(event: any) {
    this.selectedOption = event.target.value;
    if (this.selectedOption == "noHaveChild") {
      this.children = [{ fName: "", lName: "", id: "", dateOfBirth: "" }];
      this.myForm.get('children')?.setValue([]);
      this.myForm.get('haveChild')?.setValue(false);
    }
    else{
      this.myForm.get('haveChild')?.setValue(true);
    }
  }

  changePasswordValidinput(event: any) {
    this.passwordValidInput = event.target.value;
    console.log(this.passwordValidInput);
  }

  checkPassword() {
    const realPass = this.myForm.get('password')?.value;
    console.log(realPass);
    if (this.passwordValidInput === realPass) {
      this.passwordValid = true;
    } else {
      this.passwordValid = false;
    }
  }
}
