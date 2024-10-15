import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl, FormArray, AbstractControl } from '@angular/forms';
import { RegisterService } from './register.service';
import { ICityData, IItemNavigate } from 'src/app/shared/interface';
import { AuthService } from 'src/app/services/auth.service';
import { Router } from '@angular/router';
import { RegisterFormControls, RegisterFormModules } from './regiater.enum';
import { startWith, Subject, takeUntil, tap } from 'rxjs';
import { IonicSelectableComponent } from 'ionic-selectable';
import { ButtonClass, ButtonSize } from 'src/app/shared/button/button.enum';
import { cloneDeep } from 'lodash';
import { businessTypeOptionsList, employmentTypeOptionsList, familyStatusOptionsList } from 'src/app/shared/enums';
import { FamilyStatus, FamilyStatusLabels, FormTypes } from 'src/app/shared/enums';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss', '../../shared/shared-styling.scss'],
})
export class RegisterPage implements OnInit, OnDestroy {
  readonly registerFormModules = RegisterFormModules;
  readonly registerFormControls = RegisterFormControls;
  readonly ButtonClass = ButtonClass;
  readonly ButtonSize = ButtonSize;
  readonly formTypes = FormTypes;
  
  private ngUnsubscribe = new Subject();
  
  myForm: FormGroup;
  cities: ICityData[];
  selectedFormModule: RegisterFormModules = this.registerFormModules.PERSONAL;
  selectedOption!: string;
  registerMode: boolean = true;
  passwordValid = true;
  displayError: string = "disabled";
  passwordValidInput!: string;
  //EmploymentStatusList = [{name: "עצמאי", value: 0}, {name: "שכיר", value: 1}, {name: "עצמאי ושכיר", value: 2}];
  employmentTypeOptionsList = employmentTypeOptionsList;
  listBusinessField = [{ value: "build", name: "בניין" }, { value: "electric", name: "חשמל" }, { value: "photo", name: "צילום" }, { value: "architecture", name: "אדריכלות" }]
  //listBusinessType = [{ value: "licensed", name: "עוסק מורשה" }, { value: "exempt", name: "עוסק פטור" }, { value: "company", name: "חברה" }]
  businessTypeOptionsList = businessTypeOptionsList;
  itemsNavigate: IItemNavigate[] = [{ name: "פרטים אישיים", link: "", icon: "person-circle-outline", id: RegisterFormModules.PERSONAL, index: 'zero' }, { name: "פרטי בן/בת זוג", link: "", icon: "people-circle-outline", id: RegisterFormModules.SPOUSE, index: 'one'}, { name: "פרטי ילדים", link: "", icon: "accessibility-sharp", id: RegisterFormModules.CHILDREN, index: 'two' }, { name: "פרטי עסק", link: "", icon: "business-sharp", id: RegisterFormModules.BUSINESS, index: 'three' }, { name: "סיסמא ואימות", link: "", icon: "ban-sharp", id: RegisterFormModules.VALIDATION, index: 'four' }]
  employeeList = [{ value: true, name: "כן" }, { value: false, name: "לא" }];
  //familyStatusOptionsList = [{value: FamilyStatus.SINGLE, name: FamilyStatusLabels[FamilyStatus.SINGLE]}, {value: 1, name: "נשוי"}, {value: 2, name: "גרוש"}]
  familyStatusOptionsList = familyStatusOptionsList;
  constructor(private router: Router, public authService: AuthService, private formBuilder: FormBuilder, private registerService: RegisterService) {
    this.itemsNavigate[0].selected = true;

    // const personalForm = this.formBuilder.group({
    //   [RegisterFormControls.FIRSTNAME]: new FormControl(
    //     '', Validators.required,
    //   ),
    //   [RegisterFormControls.LASTNAME]: new FormControl(
    //     '', Validators.required,
    //   ),
    //   [RegisterFormControls.ID]: new FormControl(
    //     '', [Validators.required, Validators.pattern(/^\d{9}$/)]
    //   ),
    //   [RegisterFormControls.EMAIL]: new FormControl(
    //     '', [Validators.required, Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
    //   ),
    //   [RegisterFormControls.PHONE]: new FormControl(
    //     '', [Validators.required, Validators.pattern(/^(050|051|052|053|054|055|058|059)\d{7}$/)]
    //   ),
    //   [RegisterFormControls.DATEOFBIRTH]: new FormControl(
    //     '', Validators.required,
    //   ),
    //   [RegisterFormControls.EMPLOYEE]: new FormControl(
    //     false, Validators.required,
    //   ),
    //   [RegisterFormControls.CITY]: new FormControl(
    //     '', Validators.required,
    //   ),
    //   [RegisterFormControls.FAMILYSTATUS]: new FormControl(
    //     '', Validators.required,
    //   ),
    // })

    const personalForm = this.formBuilder.group({
      [RegisterFormControls.FIRSTNAME]: new FormControl(
        'רוחמי', Validators.required,
      ),
      [RegisterFormControls.LASTNAME]: new FormControl(
        'לייבוביץ', Validators.required,
      ),
      [RegisterFormControls.ID]: new FormControl(
        '123456789', [Validators.required, Validators.pattern(/^\d{9}$/)]
      ),
      [RegisterFormControls.EMAIL]: new FormControl(
        'ruhami@gmail.com', [Validators.required, Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)]
      ),
      [RegisterFormControls.PHONE]: new FormControl(
        '0545412345', [Validators.required, Validators.pattern(/^(050|051|052|053|054|055|058|059)\d{7}$/)]
      ),
      [RegisterFormControls.DATEOFBIRTH]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.EMPLOYEE]: new FormControl(
        false, Validators.required,
      ),
      [RegisterFormControls.CITY]: new FormControl(
        'אשדוד', Validators.required,
      ),
      [RegisterFormControls.FAMILYSTATUS]: new FormControl(
        'רווק', Validators.required,
      ),
    })

    // const spouseForm = this.formBuilder.group({
    //   [RegisterFormControls.SPOUSEFIRSTNAME]: new FormControl(
    //     '', Validators.required,
    //   ),
    //   [RegisterFormControls.SPOUSELASTNAME]: new FormControl(
    //     '', Validators.required,
    //   ),
    //   [RegisterFormControls.SPOUSEID]: new FormControl(
    //     '', [Validators.required, Validators.pattern(/^\d{9}$/)],
    //   ),
    //   [RegisterFormControls.SPOUSEDATEOFBIRTH]: new FormControl(
    //     '', Validators.required,
    //   ),
    //   [RegisterFormControls.SPOUSEINDEPENDET]: new FormControl(
    //     false, Validators.required,
    //   ),
    //   [RegisterFormControls.SPOUSEPHONE]: new FormControl(
    //     '', [Validators.required, Validators.pattern(/^(050|051|052|053|054|055|058|059)\d{7}$/)]
    //   ),
    // })

    const spouseForm = this.formBuilder.group({
      [RegisterFormControls.SPOUSEFIRSTNAME]: new FormControl(
        'הרשי', Validators.required,
      ),
      [RegisterFormControls.SPOUSELASTNAME]: new FormControl(
        'לייבויץ', Validators.required,
      ),
      [RegisterFormControls.SPOUSEID]: new FormControl(
        '009008007', [Validators.required, Validators.pattern(/^\d{9}$/)],
      ),
      [RegisterFormControls.SPOUSEDATEOFBIRTH]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.SPOUSEINDEPENDET]: new FormControl(
        false, Validators.required,
      ),
      [RegisterFormControls.SPOUSEPHONE]: new FormControl(
        '0506782211', [Validators.required, Validators.pattern(/^(050|051|052|053|054|055|058|059)\d{7}$/)]
      ),
    })

    const childrenForm = this.formBuilder.group({
      [RegisterFormControls.CHILDREN]: this.formBuilder.array([]),
    })

    // const businessForm = this.formBuilder.group({
    //   [RegisterFormControls.BUSINESSNAME]: new FormControl(
    //     '', Validators.required,
    //   ),
    //   [RegisterFormControls.BUSINESSFIELD]: new FormControl(
    //     '', Validators.required,
    //   ),
    //   [RegisterFormControls.BUSINESSTYPE]: new FormControl(
    //     '', Validators.required,
    //   ),
    //   [RegisterFormControls.BUSINESSDATE]: new FormControl(
    //     '', Validators.required,
    //   ),
    //   [RegisterFormControls.BUSINESSID]: new FormControl(
    //     '', Validators.required,
    //   ),
    //   [RegisterFormControls.BUSINESSINVENTORY]: new FormControl(
    //     '', Validators.required,
    //   ),
    // })

    const businessForm = this.formBuilder.group({
      [RegisterFormControls.BUSINESSNAME]: new FormControl(
        'פדיקור', Validators.required,
      ),
      [RegisterFormControls.BUSINESSFIELD]: new FormControl(
        'איפור', Validators.required,
      ),
      [RegisterFormControls.BUSINESSTYPE]: new FormControl(
        'עוסק פטור', Validators.required,
      ),
      [RegisterFormControls.BUSINESSDATE]: new FormControl(
        '', Validators.required,
      ),
      [RegisterFormControls.BUSINESSID]: new FormControl(
        '224567', Validators.required,
      ),
      [RegisterFormControls.BUSINESSINVENTORY]: new FormControl(
        '', Validators.required,
      ),
    })

    const validationForm = this.formBuilder.group({
      [RegisterFormControls.PASSWORD]: new FormControl(
        '', [Validators.required, Validators.pattern(/^(?=.*[a-zA-Z].*[a-zA-Z])(?=.*\d).{8,}$/)]
      ),
      [RegisterFormControls.CONFIRM_PASSWORD]: new FormControl(
        '', [Validators.required, this.confirmPasswordValidator]
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
  this.ngUnsubscribe.complete();
}

  ngOnInit() {
    this.authService.isVerfyEmail$.pipe(takeUntil(this.ngUnsubscribe)).subscribe((value) => { //TODO: unsubscribe
      if (value) {
        this.registerMode = false;
      }
    })
    this.gelAllCities();
  }

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
    return !this.isCurrentFormValid();
  }

  gelAllCities(): void {
    this.registerService.getCities().pipe(
      takeUntil(this.ngUnsubscribe),
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

  
  getChildFormByIndex(index: number): FormGroup {
    return this.childrenArray.at(index) as FormGroup;
  }

  addChild() {
    console.log(this.myForm.get(RegisterFormModules.CHILDREN).get(RegisterFormControls.CHILDREN).value);

    const items = this.myForm.get(RegisterFormModules.CHILDREN).get(RegisterFormControls.CHILDREN) as FormArray;
    items.push(
      this.formBuilder.group({
        [RegisterFormControls.CHILD_FIRST_NAME]: new FormControl(
          '', Validators.required,
        ),
        [RegisterFormControls.CHILD_LAST_NAME]: new FormControl(
          '', Validators.required,
        ),
        [RegisterFormControls.CHILD_ID]: new FormControl(
          '', [Validators.required, Validators.pattern(/^\d{9}$/)]
        ),
        [RegisterFormControls.CHILD_DATE_OF_BIRTH]: new FormControl(
          '', Validators.required,
        )
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
    const formData = cloneDeep(this.myForm.value);
    formData.validation = {password: formData?.validation?.password};
    formData.personal.city = formData?.personal?.city?.name;
    const data = { fromReg: false, email: formData.email };
    this.authService.SignUp(formData);
  }

  onBackBtnClicked(): void {
    switch(this.selectedFormModule) {
      case RegisterFormModules.VALIDATION:
        this.selectedFormModule = RegisterFormModules.BUSINESS;
        this.setSelectedNavItem(RegisterFormModules.BUSINESS);
        break;
      case RegisterFormModules.BUSINESS:
        if (this.isSingle()) {
          this.selectedFormModule = RegisterFormModules.PERSONAL;
          this.setSelectedNavItem(RegisterFormModules.PERSONAL);
        } else {
          this.selectedFormModule = RegisterFormModules.CHILDREN;
          this.setSelectedNavItem(RegisterFormModules.CHILDREN);
        }
        break;
      case RegisterFormModules.CHILDREN:
        if (this.isMarried()) {
          this.selectedFormModule = RegisterFormModules.SPOUSE;
          this.setSelectedNavItem(RegisterFormModules.SPOUSE);
        } else {
          this.selectedFormModule = RegisterFormModules.PERSONAL;
          this.setSelectedNavItem(RegisterFormModules.PERSONAL);
        }
        break;
      case RegisterFormModules.SPOUSE:
        this.selectedFormModule = RegisterFormModules.PERSONAL;
        this.setSelectedNavItem(RegisterFormModules.PERSONAL);
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
        if (this.isSingle()) {
          this.selectedFormModule = RegisterFormModules.BUSINESS;
          this.setSelectedNavItem(RegisterFormModules.BUSINESS);
        } else if (this.isMarried()) {
          this.selectedFormModule = RegisterFormModules.SPOUSE;
          this.setSelectedNavItem(RegisterFormModules.SPOUSE);
        } else {
          this.selectedFormModule = RegisterFormModules.CHILDREN;
          this.setSelectedNavItem(RegisterFormModules.CHILDREN);
        }
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

  // changePasswordValidinput(event: any) {
  //   this.passwordValidInput = event.target.value;
  // }

  checkPassword(event: string) {
    const realPass = this.myForm.get(RegisterFormModules.VALIDATION)?.get(RegisterFormControls.PASSWORD)?.value;
    //if (this.passwordValidInput === realPass) {
    if (event === realPass) {
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
        const baseFormValidation = this.personalForm.valid && this.businessForm.valid && this.validationForm.valid;
        if (this.isSingle()) {
          return baseFormValidation;
        } else if (this.isMarried()) {
          return baseFormValidation && this.spouseForm.valid && this.childrenForm.valid;
        } else {
          return baseFormValidation && this.childrenForm.valid;
        }
      case RegisterFormModules.PERSONAL:
        return this.personalForm.valid;
      case RegisterFormModules.CHILDREN:
        return this.childrenForm.valid;
      case RegisterFormModules.SPOUSE:
        return this.spouseForm.valid;
      case RegisterFormModules.BUSINESS:
        return this.businessForm.valid;
      }
    }

    private confirmPasswordValidator(control: AbstractControl) {
      const confirmPassword = control?.value;

      if (!confirmPassword) {
        return null;
      }
    
      if (confirmPassword === control?.parent?.get('password')?.value) {
        // input is valid
        return null;
      }
      
      // input is not valid
      return {
        match: false
      }
    }

    private isSingle(): boolean {
      return this.personalForm?.get(RegisterFormControls.FAMILYSTATUS)?.value === 0;
    }

    private isMarried(): boolean {
      return this.personalForm?.get(RegisterFormControls.FAMILYSTATUS)?.value === 1;
    }
}
