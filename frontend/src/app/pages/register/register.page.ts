import { Component, OnInit, NgModule } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl } from '@angular/forms';
import { RegisterService } from './register.service';
import { IChildren } from 'src/app/shared/interface';

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
    console.log(formData);
    console.log(this.myForm.get('fName')?.errors);
    console.log(this.myForm.get('Independent')?.errors);
    
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
