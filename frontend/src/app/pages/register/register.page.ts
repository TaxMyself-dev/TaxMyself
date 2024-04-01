import { Component, OnInit, NgModule } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl, FormArray } from '@angular/forms';
import { RegisterService } from './register.service';
import { IChildren, IItemNavigate } from 'src/app/shared/interface';
import axios from 'axios';
import { AuthService } from 'src/app/services/auth.service';
import { Router } from '@angular/router';
import { RegisterFormControls, RegisterFormModules } from './regiater.enum';
import { HttpClient, HttpHeaders } from '@angular/common/http';

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
  displayError: string = "disabled";
  // popoverValid: boolean = false;
  passwordValidInput!: string;
  listBusinessField = [{ key: "build", value: "בניין" }, { key: "electric", value: "חשמל" }, { key: "photo", value: "צילום" }, { key: "architecture", value: "אדריכלות" }]
  listBusinessType = [{ key: "licensed", value: "עוסק מורשה" }, { key: "exempt", value: "עוסק פטור" }, { key: "company", value: "חברה" }]
  itemsNavigate: IItemNavigate[] = [{ name: "פרטים אישיים", link: "", icon: "person-circle-outline", id: RegisterFormModules.PERSONAL }, { name: "פרטי בן/בת זוג", link: "", icon: "people-circle-outline", id: RegisterFormModules.SPOUSE }, { name: "פרטי ילדים", link: "", icon: "accessibility-sharp", id: RegisterFormModules.CHILDREN }, { name: "פרטי עסק", link: "", icon: "business-sharp", id: RegisterFormModules.BUSINESS }, { name: "סיסמא ואימות", link: "", icon: "ban-sharp", id: RegisterFormModules.VALIDATION }]
  employeeList = [{ value: true, name: "כן" }, { value: false, name: "לא" }];

  constructor(private http: HttpClient, private router: Router, public authService: AuthService, private formBuilder: FormBuilder, private registerService: RegisterService) {
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
        '', [Validators.required, Validators.pattern(/^(050|051|052|053|054|055|058|059)\d{7}$/)]
      ),
      [RegisterFormControls.DATEOFBIRTH]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.EMPLOYEE]: new FormControl(
        false, Validators.required,
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
        '', [Validators.required, Validators.pattern(/^\d{9}$/)],
      ),
      [RegisterFormControls.SPOUSEDATEOFBIRTH]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.SPOUSEINDEPENDET]: new FormControl(
        false, Validators.required,
      ),
      [RegisterFormControls.SPOUSEPHONE]: new FormControl(
        '', [Validators.required, Validators.pattern(/^(050|051|052|053|054|055|058|059)\d{7}$/)]
      ),
    })

    const childrenForm = this.formBuilder.group({
      [RegisterFormControls.CHILDREN]: this.formBuilder.array([
        this.formBuilder.group({
          childFName: ['', Validators.required],
          childLName: ['', Validators.required],
          childID: ['', Validators.required, Validators.pattern(/^\d{9}$/)],
          childDate: ['', Validators.required]
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
        '', [Validators.required, Validators.pattern(/^(?=.*[a-zA-Z].*[a-zA-Z])(?=.*\d).{8,}$/)]
      ),
    })

    this.myForm = this.formBuilder.group({
      [RegisterFormModules.PERSONAL]: personalForm,
      [RegisterFormModules.SPOUSE]: spouseForm,
      [RegisterFormModules.CHILDREN]: childrenForm,
      [RegisterFormModules.BUSINESS]: businessForm,
      [RegisterFormModules.VALIDATION]: validationForm,
    });






    // const personalForm = this.formBuilder.group({
    //   [RegisterFormControls.FIRSTNAME]: new FormControl(
    //     'aaa', Validators.required,
    //   ),
    //   [RegisterFormControls.LASTNAME]: new FormControl(
    //     'aaaa', Validators.required,
    //   ),
    //   [RegisterFormControls.ID]: new FormControl(
    //     '333333333', [Validators.required, Validators.pattern(/^\d{9}$/)]
    //   ),
    //   [RegisterFormControls.EMAIL]: new FormControl(
    //     '10@gmail.com', [Validators.required, Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
    //   ),
    //   [RegisterFormControls.PHONE]: new FormControl(
    //     '0525675730', [Validators.required, Validators.pattern(/^(052|051|053|054|058|055)\d{7}$/)]
    //   ),
    //   [RegisterFormControls.DATEOFBIRTH]: new FormControl(
    //     '2015-12-10', Validators.required,
    //   ),
    //   [RegisterFormControls.EMPLOYEE]: new FormControl(
    //     false, Validators.required,
    //   ),
    //   [RegisterFormControls.CITY]: new FormControl(
    //     'll', Validators.required,
    //   ),
    //   [RegisterFormControls.FAMILYSTATUS]: new FormControl(
    //     '1', Validators.required,
    //   ),
    // })

    // const spouseForm = this.formBuilder.group({
    //   [RegisterFormControls.SPOUSEFIRSTNAME]: new FormControl(
    //     'hdh', Validators.required,
    //   ),
    //   [RegisterFormControls.SPOUSELASTNAME]: new FormControl(
    //     'dgr', Validators.required,
    //   ),
    //   [RegisterFormControls.SPOUSEID]: new FormControl(
    //     '111111111', Validators.pattern(/^\d{9}$/),
    //   ),
    //   [RegisterFormControls.SPOUSEDATEOFBIRTH]: new FormControl(
    //     '2012-05-01', Validators.required,
    //   ),
    //   [RegisterFormControls.SPOUSEINDEPENDET]: new FormControl(
    //     false, Validators.required,
    //   ),
    //   [RegisterFormControls.SPOUSEPHONE]: new FormControl(
    //     '0526204910', [Validators.required,Validators.pattern(/^(052|051|053|054|058|055)\d{7}$/)]
    //   ),
    // })

    // const childrenForm = this.formBuilder.group({
    //   [RegisterFormControls.CHILDREN]: this.formBuilder.array([
    //     this.formBuilder.group({
    //       childFName: ['egtfh', Validators.required],
    //       childLName: ['grsdht', Validators.required],
    //       childID: ['111222333', Validators.required],
    //       childDate: ['2022-12-12', Validators.required]
    //     })
    //   ]),
    // })

    // const businessForm = this.formBuilder.group({
    //   [RegisterFormControls.BUSINESSNAME]: new FormControl(
    //     'rhtjyk', Validators.required,
    //   ),
    //   [RegisterFormControls.BUSINESSFIELD]: new FormControl(
    //     'esrgdth', Validators.required,
    //   ),
    //   [RegisterFormControls.BUSINESSTYPE]: new FormControl(
    //     'dsgfhg', Validators.required,
    //   ),
    //   [RegisterFormControls.BUSINESSDATE]: new FormControl(
    //     '2012-10-12', Validators.required,
    //   ),
    //   [RegisterFormControls.BUSINESSID]: new FormControl(
    //     '23164', Validators.required,
    //   ),

    // })

    // const validationForm = this.formBuilder.group({
    //   [RegisterFormControls.PASSWORD]: new FormControl(
    //     '151515sh', [Validators.required,Validators.pattern(/^(?=.*[a-zA-Z].*[a-zA-Z])(?=.*\d).{8,}$/)]
    //   ),
    // })



    this.myForm = this.formBuilder.group({
      [RegisterFormModules.PERSONAL]: personalForm,
      [RegisterFormModules.SPOUSE]: spouseForm,
      [RegisterFormModules.CHILDREN]: childrenForm,
      [RegisterFormModules.BUSINESS]: businessForm,
      [RegisterFormModules.VALIDATION]: validationForm,
    });
  }


  ngOnInit() {

    console.log("on init reg");

    this.authService.isVerfyEmail$.subscribe((value) => {//TODO: unsubscribe
      if (value) {
        this.registerMode = false;
      }
    })
    this.gelAllCities();
    
    // const response = await fetch(
    //   'https://parseapi.back4app.com/classes/Israelcities_City?limit=10&order=-name&keys=name',
    //   {
    //     headers: {
    //       'X-Parse-Application-Id': 'qApdv7tIqcxhsd6atYnooRWLx8rbx4hH7xH8Fhfg', // This is your app's application id
    //       'X-Parse-REST-API-Key': 'xrKdPC9tyJ8yqxniG5AgZlfWK2l4es84sPdiEJLl', // This is your app's REST API key
    //     }
    //   }
    // );
    // const data = await response.json(); // Here you have the data that you need
    // console.log(JSON.stringify(data, null, 2));
  };
  // this.authService.isErrSignup$.subscribe((val) =>{
  //   console.log("in sun reg");

  //   switch (val) {
  //     case "auth/email-already-in-used":
  //       this.displayError = "user";
  //       console.log(this.displayError);

  //       break;
  //     case "auth/invalid-email":
  //       this.displayError = "email";
  //       console.log(this.displayError);

  //       break;
  //     case "auth/network-request-failed":
  //       this.displayError = "net";
  //       console.log(this.displayError);

  //       break;
  //     case "auth/user-disabled":
  //     case "auth/user-not-found":
  //       this.displayError = "disabled";
  //       console.log(this.displayError);

  //       break;
  //     case "auth/too-many-requests":
  //       this.displayError = "many";
  //       console.log(this.displayError);

  //       break;
  //   }
  // })



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

gelAllCities(): any {
  const url = 'https://parseapi.back4app.com/classes/Israelcities_City?limit=1500&order=-name&keys=name';
    const headers = new HttpHeaders({
      'X-Parse-Application-Id': 'qApdv7tIqcxhsd6atYnooRWLx8rbx4hH7xH8Fhfg', // This is your app's application id
      'X-Parse-REST-API-Key': 'xrKdPC9tyJ8yqxniG5AgZlfWK2l4es84sPdiEJLl', // This is your app's REST API key
    });

    const options = { headers: headers };
    return this.http.get<any>(url,options).subscribe((res) =>{
      console.log(res);
      
    })
}

addChild() {
  console.log(this.myForm.get(RegisterFormModules.CHILDREN).get(RegisterFormControls.CHILDREN).value);

  const items = this.myForm.get(RegisterFormModules.CHILDREN).get(RegisterFormControls.CHILDREN) as FormArray;
  items.push(
    this.formBuilder.group({
      childFName: [''],
      childLName: [''],
      childID: [''],
      childDate: ['']
    })
  );
}

removeChild(index: number) {
  const items = this.myForm.get(RegisterFormModules.CHILDREN).get(RegisterFormControls.CHILDREN) as FormArray;
  if (items.length >= 2) {
    items.removeAt(index);
  }
}

handleFormRegister() {
  const formData = this.myForm.value;
  console.log(formData);
  const data = { fromReg: false, email: formData.email };
  this.authService.SignUp(formData);
  // this.router.navigate(['login'], { queryParams: data });
}

onBackBtnClicked(): void {
  switch(this.selectedFormModule) {
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
  switch(this.selectedFormModule) {
      case RegisterFormModules.VALIDATION:
  this.handleFormRegister();
  console.log(this.displayError);

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
  switch(event.name) {
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
