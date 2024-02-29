import { Component, OnInit, NgModule } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl, FormArray } from '@angular/forms';
import { RegisterService } from './register.service';
import { IChildren, IItemNavigate } from 'src/app/shared/interface';
import axios from 'axios';
import { AuthService } from 'src/app/services/auth.service';
import { Router } from '@angular/router';
import { RegisterFormControls, RegisterFormModules } from './regiater.enum';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
})
export class RegisterPage implements OnInit {
  readonly registerFormModules = RegisterFormModules;
  readonly registerFormControls = RegisterFormControls;

  myForm: FormGroup;

  selectedFormModule: RegisterFormModules = this.registerFormModules.PERSONAL;
  selectedOption!: string;
  today!: string;
  registerMode: boolean = true;
  passwordValid = true;
  passwordValidInput!: string;
  listBusinessField = [{ key: "build", value: "בניין" }, { key: "electric", value: "חשמל" }, { key: "photo", value: "צילום" }, { key: "architecture", value: "אדריכלות" }]
  listBusinessType = [{ key: "licensed", value: "עוסק מורשה" }, { key: "exempt", value: "עוסק פטור" }, { key: "company", value: "חברה" }]
  itemsNavigate: IItemNavigate[] = [{ name: "פרטים אישיים", link: "", icon: "person-circle-outline", id: RegisterFormModules.PERSONAL }, { name: "פרטי בן/בת זוג", link: "", icon: "people-circle-outline", id: RegisterFormModules.SPOUSE }, { name: "פרטי ילדים", link: "", icon: "accessibility-sharp", id: RegisterFormModules.CHILDREN }, { name: "פרטי עסק", link: "", icon: "business-sharp", id: RegisterFormModules.BUSINESS }, { name: "סיסמא ואימות", link: "", icon: "ban-sharp", id: RegisterFormModules.VALIDATION }]

  constructor(private router: Router, private authService: AuthService, private formBuilder: FormBuilder, private registerService: RegisterService) {
    const currentDate = new Date();
    this.today = currentDate.toISOString().substring(0, 10);
    this.itemsNavigate[0].selected = true;

    const personalForm = this.formBuilder.group({
      [RegisterFormControls.FIRSTNAME]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.LASTNAME]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.ID]: new FormControl(
        '', [Validators.required, Validators.pattern(/^\d{9}$/)]
      ),
      [RegisterFormControls.EMAIL]: new FormControl(
        '', [Validators.required, Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
      ),
      [RegisterFormControls.PHONE]: new FormControl(
        '', [Validators.required, Validators.pattern(/^\d{10}$/)]
      ),
      [RegisterFormControls.DATEOFBIRTH]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.EMPLOYEE]: new FormControl(
        false, Validators.requiredTrue,
      ),
      [RegisterFormControls.CITY]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.FAMILYSTATUS]: new FormControl(
        '', Validators.required,
      ),
    })

    const spouseForm = this.formBuilder.group({
      [RegisterFormControls.SPOUSEFIRSTNAME]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.SPOUSELASTNAME]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.SPOUSEID]: new FormControl(
        '', Validators.pattern(/^\d{9}$/),
      ),
      [RegisterFormControls.SPOUSEDATEOFBIRTH]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.SPOUSEINDEPENDET]: new FormControl(
        false, Validators.requiredTrue,
      ),
      [RegisterFormControls.SPOUSEPHONE]: new FormControl(
        false, Validators.requiredTrue,
      ),
    })

    const childrenForm = this.formBuilder.group({
      [RegisterFormControls.CHILDREN]: this.formBuilder.array([
        this.formBuilder.group({
          childFName: [''],
          childLName: [''],
          childID: [''],
          childDate: ['']
        })
      ]),
    })

    const businessForm = this.formBuilder.group({
      [RegisterFormControls.BUSINESSNAME]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.BUSINESSFIELD]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.BUSINESSTYPE]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.BUSINESSDATE]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.BUSINESSID]: new FormControl(
        '', Validators.required,
      ),

    })

    const validationForm = this.formBuilder.group({
      [RegisterFormControls.PASSWORD]: new FormControl(
        '', Validators.requiredTrue,
      ),
    })



    this.myForm = this.formBuilder.group({
      [RegisterFormModules.PERSONAL]: personalForm,
      [RegisterFormModules.SPOUSE]: spouseForm,
      [RegisterFormModules.CHILDREN]: childrenForm,
      [RegisterFormModules.BUSINESS]: businessForm,
      [RegisterFormModules.VALIDATION]: validationForm,
    });

    console.log(this.myForm);
    console.log(this.personalForm);
    console.log(this.registerFormControls);


  }


  ngOnInit() {
    this.authService.isVerfyEmail$.subscribe((value) => {//TODO: unsubscribe
      if (value) {
        this.registerMode = false;
      }
    })
  };

  get personalForm(): FormGroup {
    return this.myForm.get(RegisterFormModules.PERSONAL) as FormGroup;
  }

  get spouseForm(): FormGroup {
    return this.myForm.get(RegisterFormModules.SPOUSE) as FormGroup;
  }

  get childrenForm(): FormGroup {
    return this.myForm.get(RegisterFormModules.CHILDREN) as FormGroup;
  }

  get childrenArray(): FormArray {
    return this.myForm.get(RegisterFormModules.CHILDREN).get(RegisterFormControls.CHILDREN) as FormArray;
  }

  get businessForm(): FormGroup {
    return this.myForm.get(RegisterFormModules.BUSINESS) as FormGroup;
  }

  get validationForm(): FormGroup {
    return this.myForm.get(RegisterFormModules.VALIDATION) as FormGroup;
  }

  get buttonNextText(): string {
    return this.selectedFormModule !== RegisterFormModules.VALIDATION ? 'הבא' : 'שלח';
  }

  addChild() {
    console.log(this.myForm.get(RegisterFormModules.CHILDREN).get(RegisterFormControls.CHILDREN).value);
    
      const items = this.myForm.get(RegisterFormModules.CHILDREN).get(RegisterFormControls.CHILDREN) as FormArray;
      if (!items.invalid) {
        items.push(
          this.formBuilder.group({
            childFName: [''],
            childLName: [''],
            childID: [''],
            childDate: ['']
          })
        );
      
    }
  }

  removeChild(index: number) {
    const items =this.myForm.get(RegisterFormModules.CHILDREN).get(RegisterFormControls.CHILDREN) as FormArray;
    items.removeAt(index);
  }

  handleFormRegister() {
    const formData = this.myForm.value;
    const data = { fromReg: false, email: formData.email };
    formData.spouseIndependet == "true" ? formData.spouseIndependet = true : formData.spouseIndependet = false
    formData.employee == "true" ? formData.employee = true : formData.employee = false
    console.log(formData);

    this.authService.SignUp(formData);
    this.router.navigate(['login'], { queryParams: data });
  }

  
  onBackBtnClicked(): void {
    switch (this.selectedFormModule) {
      case RegisterFormModules.VALIDATION:
        this.selectedFormModule = RegisterFormModules.BUSINESS;
        this.setSelectedNavItem(RegisterFormModules.BUSINESS)
        break;
      case RegisterFormModules.BUSINESS:
        this.selectedFormModule = RegisterFormModules.CHILDREN;
        this.setSelectedNavItem(RegisterFormModules.CHILDREN)
        break;
      case RegisterFormModules.CHILDREN:
        this.selectedFormModule = RegisterFormModules.SPOUSE;
        this.setSelectedNavItem(RegisterFormModules.SPOUSE)
        break;
      case RegisterFormModules.SPOUSE:
        this.selectedFormModule = RegisterFormModules.PERSONAL;
        this.setSelectedNavItem(RegisterFormModules.PERSONAL)
        break;
    }
  }

  onNextBtnClicked(): void {
    switch (this.selectedFormModule) {
      case RegisterFormModules.VALIDATION:
        //TODO: savve form
        break;
      case RegisterFormModules.PERSONAL:
        this.selectedFormModule = RegisterFormModules.SPOUSE;
        this.setSelectedNavItem(RegisterFormModules.SPOUSE)
        break;
      case RegisterFormModules.CHILDREN:
        this.selectedFormModule = RegisterFormModules.BUSINESS;
        this.setSelectedNavItem(RegisterFormModules.BUSINESS)
        break;
      case RegisterFormModules.SPOUSE:
        this.selectedFormModule = RegisterFormModules.CHILDREN;
        this.setSelectedNavItem(RegisterFormModules.CHILDREN)
        break;
      case RegisterFormModules.BUSINESS:
        this.selectedFormModule = RegisterFormModules.VALIDATION;
        this.setSelectedNavItem(RegisterFormModules.VALIDATION)
        break;
    }
  } 

  changePasswordValidinput(event: any) {
    this.passwordValidInput = event.target.value;
    console.log(this.passwordValidInput);
    console.log(this.passwordValid);
    
  }

  checkPassword() {
    const realPass = this.myForm.get(RegisterFormModules.VALIDATION)?.get(RegisterFormControls.PASSWORD)?.value;
    console.log(realPass);
    console.log(this.passwordValid);
    
    if (this.passwordValidInput === realPass) {
      this.passwordValid = true;
    } else {
      this.passwordValid = false;
    }
  }

  navigateclicked(event: IItemNavigate): void {
    console.log(event);
    switch (event.name) {
      case "פרטים אישיים":
        this.selectedFormModule = this.registerFormModules.PERSONAL
        break;

      case "פרטי בן/בת זוג":
        this.selectedFormModule = this.registerFormModules.SPOUSE
        break;

      case "פרטי ילדים":
        this.selectedFormModule = this.registerFormModules.CHILDREN
        break;

      case "פרטי עסק":
        this.selectedFormModule = this.registerFormModules.BUSINESS
        break;

      case "סיסמא ואימות":
        this.selectedFormModule = this.registerFormModules.VALIDATION
        break;

      default:
        this.selectedFormModule = this.registerFormModules.PERSONAL
        break;
    }
  }

  private setSelectedNavItem(selectedModule: RegisterFormModules) {
    this.itemsNavigate.forEach((item: IItemNavigate) =>
      item.selected = item.id === selectedModule
    )
  }

  navigateToLogin(): void {
    this.router.navigate(['login']);
  }
}
