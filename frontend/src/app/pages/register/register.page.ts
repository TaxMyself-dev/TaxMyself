import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl, FormArray } from '@angular/forms';
import { RegisterService } from './register.service';
import { ICityData, IItemNavigate } from 'src/app/shared/interface';
import { AuthService } from 'src/app/services/auth.service';
import { Router } from '@angular/router';
import { RegisterFormControls, RegisterFormModules } from './regiater.enum';
import { BehaviorSubject, Observable, map, startWith, tap } from 'rxjs';
import { IonicSelectableComponent } from 'ionic-selectable';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
})
export class RegisterPage implements OnInit, OnDestroy {
  readonly registerFormModules = RegisterFormModules;
  readonly registerFormControls = RegisterFormControls;

  myForm: FormGroup;
  cities: ICityData[];
  ports: any;
  port: any;
  selectedFormModule: RegisterFormModules = this.registerFormModules.PERSONAL;
  selectedOption!: string;
  today!: string;
  registerMode: boolean = true;
  passwordValid = true;
  displayError: string = "disabled";
  passwordValidInput!: string;
  EmploymentStatusList = [{key: "עצמאי", value: 0}, {key: "שכיר", value: 1}, {key: "עצמאי ושכיר", value: 2}];
  listBusinessField = [{ key: "build", value: "בניין" }, { key: "electric", value: "חשמל" }, { key: "photo", value: "צילום" }, { key: "architecture", value: "אדריכלות" }]
  listBusinessType = [{ key: "licensed", value: "עוסק מורשה" }, { key: "exempt", value: "עוסק פטור" }, { key: "company", value: "חברה" }]
  itemsNavigate: IItemNavigate[] = [{ name: "פרטים אישיים", link: "", icon: "person-circle-outline", id: RegisterFormModules.PERSONAL, index: 'zero' }, { name: "פרטי בן/בת זוג", link: "", icon: "people-circle-outline", id: RegisterFormModules.SPOUSE, index: 'one'}, { name: "פרטי ילדים", link: "", icon: "accessibility-sharp", id: RegisterFormModules.CHILDREN, index: 'two' }, { name: "פרטי עסק", link: "", icon: "business-sharp", id: RegisterFormModules.BUSINESS, index: 'three' }, { name: "סיסמא ואימות", link: "", icon: "ban-sharp", id: RegisterFormModules.VALIDATION, index: 'four' }]
  employeeList = [{ value: true, name: "כן" }, { value: false, name: "לא" }];

  constructor(private router: Router, public authService: AuthService, private formBuilder: FormBuilder, private registerService: RegisterService) {
    const currentDate = new Date();
    this.today = currentDate.toISOString().substring(0, 10);
    this.itemsNavigate[0].selected = true;


  this.ports = [
    { id: 1, name: 'Tokai' },
    { id: 2, name: 'Vladivostok' },
    { id: 3, name: 'Navlakhi' }
  ];


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
      [RegisterFormControls.CHILDREN]: this.formBuilder.array([]),
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
      [RegisterFormControls.BUSINESSINVENTORY]: new FormControl(
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
  }

ngOnDestroy(): void {
    this.authService.isVerfyEmail$.unsubscribe();
}

  ngOnInit() {
    this.authService.isVerfyEmail$.subscribe((value) => {//TODO: unsubscribe
      if (value) {
        this.registerMode = false;
      }
    })
    this.gelAllCities();
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

  get isNextButtonDisabled(): boolean {
    return this.isCurrentFormValid();
  }

  gelAllCities(): void {
    this.registerService.getCities().pipe(
      startWith([]), 
      tap((res) => {
        if (res.length) {
          this.cities = res.slice(1);
        }
        else {
          this.cities = [];
        }

 
      }
    )).subscribe();
  }


  portChange(event: {
    component: IonicSelectableComponent,
    value: any
  }) {
    console.log('port:', event.value);
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
    // if (items.length >= 2) {
      items.removeAt(index);
    // }
  }

  handleFormRegister() {
    const formData = this.myForm.value;
    console.log(formData);
    const data = { fromReg: false, email: formData.email };
    this.authService.SignUp(formData);
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
  }

  checkPassword() {
    const realPass = this.myForm.get(RegisterFormModules.VALIDATION)?.get(RegisterFormControls.PASSWORD)?.value;
    if (this.passwordValidInput === realPass) {
      this.passwordValid = true;
    } else {
      this.passwordValid = false;
    }
  }

  navigateclicked(event: IItemNavigate): void {
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

  private isCurrentFormValid(): boolean {
    switch(this.selectedFormModule) {
      case RegisterFormModules.VALIDATION:
        return !this.passwordValid || this.myForm.invalid;
      case RegisterFormModules.PERSONAL:
        return this.personalForm.invalid;
      case RegisterFormModules.CHILDREN:
        return this.childrenForm.invalid;
      case RegisterFormModules.SPOUSE:
        return this.spouseForm.invalid;
      case RegisterFormModules.BUSINESS:
        return this.businessForm.invalid;
      }
    }

}
