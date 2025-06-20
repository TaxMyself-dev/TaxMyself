import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl, FormArray, AbstractControl } from '@angular/forms';
import { RegisterService } from './register.service';
import { IItemNavigate, ISelectItem } from 'src/app/shared/interface';
import { AuthService } from 'src/app/services/auth.service';
import { Router } from '@angular/router';
import { RegisterFormControls, RegisterFormModules } from './regiater.enum';
import { map, startWith, Subject, takeUntil, tap } from 'rxjs';
import { ButtonClass } from 'src/app/shared/button/button.enum';
import { cloneDeep } from 'lodash';
import { businessTypeOptionsList, EmploymentType, employmentTypeOptionsList, familyStatusOptionsList } from 'src/app/shared/enums';
import { FamilyStatus, FormTypes } from 'src/app/shared/enums';
import { inputsSize } from 'src/app/shared/enums';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';

@Component({
    selector: 'app-register',
    templateUrl: './register.page.html',
    styleUrls: ['./register.page.scss', '../../shared/shared-styling.scss'],
    standalone: false
})
export class RegisterPage implements OnInit, OnDestroy {


  inputsSize = inputsSize;
  buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  selectedGender: string = '';

  readonly registerFormModules = RegisterFormModules;
  readonly registerFormControls = RegisterFormControls;
  readonly ButtonClass = ButtonClass;
  readonly ButtonSize = ButtonSize;
  readonly formTypes = FormTypes;

  private ngUnsubscribe = new Subject();

  myForm: FormGroup;
  cities: ISelectItem[];
  selectedFormModule: RegisterFormModules = this.registerFormModules.PERSONAL;
  selectedOption!: string;
  registerMode: boolean = true;
  passwordValid = true;
  hasChildren: boolean = false;
  displayError: string = "disabled";
  passwordValidInput!: string;
  employmentTypeOptionsList = employmentTypeOptionsList;
  listBusinessField = [{ value: "build", name: "בניין" }, { value: "electric", name: "חשמל" }, { value: "photo", name: "צילום" }, { value: "architecture", name: "אדריכלות" }]
  businessTypeOptionsList = businessTypeOptionsList;
  itemsNavigate: IItemNavigate[] = [{ name: "פרטים אישיים", link: "", image: "person-circle-outline", id: RegisterFormModules.PERSONAL, index: 'zero' }, { name: "פרטי בן/בת זוג", link: "", image: "people-circle-outline", id: RegisterFormModules.SPOUSE, index: 'one' }, { name: "פרטי ילדים", link: "", image: "accessibility-sharp", id: RegisterFormModules.CHILDREN, index: 'two' }, { name: "פרטי עסק", link: "", image: "business-sharp", id: RegisterFormModules.BUSINESS, index: 'three' }, { name: "סיסמא ואימות", link: "", image: "ban-sharp", id: RegisterFormModules.VALIDATION, index: 'four' }]
  employeeList = [{ value: true, name: "כן" }, { value: false, name: "לא" }];
  familyStatusOptionsList = familyStatusOptionsList;
  requierdField: boolean = process.env.NODE_ENV !== 'production' ? false : true;
  //requierdField: boolean = true;

  constructor(private router: Router, public authService: AuthService, private formBuilder: FormBuilder, private registerService: RegisterService) {
    this.itemsNavigate[0].selected = true;    

    const personalForm = this.formBuilder.group({
      [RegisterFormControls.FIRSTNAME]: new FormControl(
        '', this.requierdField ? [Validators.required, Validators.pattern(/^[A-Za-zא-ת ]+$/)] : null
      ),
      [RegisterFormControls.LASTNAME]: new FormControl(
        '', this.requierdField ? [Validators.required, Validators.pattern(/^[A-Za-zא-ת ]+$/)] : null
      ),
      [RegisterFormControls.ID]: new FormControl(
        '', this.requierdField ? [Validators.required, Validators.pattern(/^\d{9}$/)] : null,
      ),
      [RegisterFormControls.GENDER]: new FormControl(
        '', this.requierdField ? [Validators.required] : null,
      ),
      [RegisterFormControls.EMAIL]: new FormControl(
        '', this.requierdField ? [Validators.required, Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)] : null,
      ),
      [RegisterFormControls.PHONE]: new FormControl(
        '', this.requierdField ? [Validators.pattern(/^(050|051|052|053|054|055|058|059)\d{7}$/)] : null,
      ),
      [RegisterFormControls.DATEOFBIRTH]: new FormControl(
        '', this.requierdField ? [Validators.required] : null,
      ),
      [RegisterFormControls.EMPLOYEMENTSTATUS]: new FormControl(
        null, Validators.required,
      ),
      [RegisterFormControls.CITY]: new FormControl(
        '', this.requierdField ? Validators.required : null,
      ),
      [RegisterFormControls.FAMILYSTATUS]: new FormControl(
        null, Validators.required,
      ),
      [RegisterFormControls.PASSWORD]: new FormControl(
        '', [Validators.required, Validators.pattern(/^(?=.*[a-zA-Z].*[a-zA-Z])(?=.*\d).{8,}$/)]
      ),
      [RegisterFormControls.CONFIRM_PASSWORD]: new FormControl(
        '', [Validators.required]
      ),
    }, { validators: this.matchPasswords })

    const spouseForm = this.formBuilder.group({
      [RegisterFormControls.SPOUSEFIRSTNAME]: new FormControl(
        null, this.requierdField && !this.isSingle() ? Validators.required : null,
      ),
      [RegisterFormControls.SPOUSELASTNAME]: new FormControl(
        null, this.requierdField && !this.isSingle() ? Validators.required : null,
      ),
      [RegisterFormControls.SPOUSEID]: new FormControl(
        null, this.requierdField && !this.isSingle() ? [Validators.required, Validators.pattern(/^\d{9}$/)] : null,
      ),
      [RegisterFormControls.SPOUSEDATEOFBIRTH]: new FormControl(
        null, this.requierdField && !this.isSingle() ? Validators.required : null,
      ),
      [RegisterFormControls.SPOUSEEMPLOYEMENTSTATUS]: new FormControl(
        null, this.requierdField && !this.isSingle() ? Validators.required : null,
      ),
      [RegisterFormControls.SPOUSEPHONE]: new FormControl(
        null, this.requierdField && !this.isSingle() ? [Validators.required, Validators.pattern(/^(050|051|052|053|054|055|058|059)\d{7}$/)] : null,
      ),
      [RegisterFormControls.SPOUSEEMAIL]: new FormControl(
        '', this.requierdField ? [Validators.required, Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)] : null,
      ),
      [RegisterFormControls.SPOUSEGENDER]: new FormControl(
        '', this.requierdField ? [Validators.required] : null,
      ),
    })

    const childrenForm = this.formBuilder.group({
      [RegisterFormControls.CHILDREN]: this.formBuilder.array([]),
    })

    const businessForm = this.formBuilder.group({
      [RegisterFormControls.BUSINESSNAME]: new FormControl(
        null, this.requierdField && this.isIndependent() ? Validators.required : null,
      ),
      [RegisterFormControls.BUSINESSTYPE]: new FormControl(
        null, this.requierdField && this.isIndependent() ? Validators.required : null,
      ),
      // [RegisterFormControls.BUSINESSDATE]: new FormControl(
      //   null, this.requierdField && this.isIndependent() ? Validators.required : null,
      // ),
      [RegisterFormControls.BUSINESSNUMBER]: new FormControl(
        null, this.requierdField && this.isIndependent() ? [Validators.required,  Validators.pattern(/^\d+$/)] : null,
      ),
      // [RegisterFormControls.BUSINESSINVENTORY]: new FormControl(
      //   null, this.requierdField && this.isIndependent() ? Validators.required : null,
      // ),
      [RegisterFormControls.SPOUSEBUSINESSNAME]: new FormControl(
        null, this.requierdField && this.isMarried() && this.isSpouseIndependent() ? Validators.required : null,
      ),
      [RegisterFormControls.SPOUSEBUSINESSTYPE]: new FormControl(
        null, this.requierdField && this.isMarried() && this.isSpouseIndependent() ? Validators.required : null,
      ),
      // [RegisterFormControls.SPOUSEBUSINESSDATE]: new FormControl(
      //   null, this.requierdField && this.isMarried() && this.isSpouseIndependent() ? Validators.required : null,
      // ),
      [RegisterFormControls.SPOUSEBUSINESSNUMBER]: new FormControl(
        null, this.requierdField && this.isMarried() && this.isSpouseIndependent() ? Validators.required : null,
      ),
      // [RegisterFormControls.SPOUSEBUSINESSINVENTORY]: new FormControl(
      //   null, this.requierdField && this.isMarried() && this.isSpouseIndependent() ? Validators.required : null,
      // ),
    })

    // const validationForm = this.formBuilder.group({
    //   [RegisterFormControls.PASSWORD]: new FormControl(
    //     '', [Validators.required, Validators.pattern(/^(?=.*[a-zA-Z].*[a-zA-Z])(?=.*\d).{8,}$/)]
    //   ),
    //   [RegisterFormControls.CONFIRM_PASSWORD]: new FormControl(
    //     '', [Validators.required]
    //   ),
    // }, { validators: this.matchPasswords })

    // Subscribe to PASSWORD field changes to revalidate CONFIRM_PASSWORD
    this.validationForm?.get(RegisterFormControls.PASSWORD)?.valueChanges.subscribe(() => {
      this.validationForm?.get(RegisterFormControls.CONFIRM_PASSWORD)?.updateValueAndValidity();
    });

    this.myForm = this.formBuilder.group({
      [RegisterFormModules.PERSONAL]: personalForm,
      [RegisterFormModules.SPOUSE]: spouseForm,
      [RegisterFormModules.CHILDREN]: childrenForm,
      [RegisterFormModules.BUSINESS]: businessForm,
      //[RegisterFormModules.VALIDATION]: validationForm,
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
    //this.gelAllCities();
  }

  doRefresh(event: any) {
    console.log('Begin async operation');

    // Simulate a network request or page refresh
    setTimeout(() => {
      console.log('Async operation has ended');
      event.target.complete(); // Stop the refresher spinner
    }, 2000);
  }

  get personalForm(): FormGroup {
    return this.myForm?.get(RegisterFormModules.PERSONAL) as FormGroup;
  }

  get spouseForm(): FormGroup {
    return this.myForm?.get(RegisterFormModules.SPOUSE) as FormGroup;
  }

  get childrenForm(): FormGroup {
    return this.myForm?.get(RegisterFormModules.CHILDREN) as FormGroup;
  }

  get childrenArray(): FormArray {
    return this.myForm?.get(RegisterFormModules.CHILDREN).get(RegisterFormControls.CHILDREN) as FormArray;
  }

  get businessForm(): FormGroup {
    return this.myForm?.get(RegisterFormModules.BUSINESS) as FormGroup;
  }

  get validationForm(): FormGroup {
    return this.myForm?.get(RegisterFormModules.VALIDATION) as FormGroup;
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
      map((cities) => {
        return cities.map((city) => ({
          name: city.name,
          value: city.name
        }))
      }),
      tap((res) => {
        console.log(res);

        if (res.length) {
          this.cities = res.slice(1);
        }
        else {
          this.cities = [];
        }
      }
      ),
    )
      .subscribe();
  }

  getChildFormByIndex(index: number): FormGroup {
    return this.childrenArray.at(index) as FormGroup;
  }

  handleHasChildrenChange(checked: boolean): void {
  if (checked) {
    // switch turned ON
    console.log('User has children – add child or show fields');
    this.hasChildren = true;
    this.addChild(); // for example
  } else {
    // switch turned OFF
    console.log('User disabled children section');
    this.hasChildren = false
    this.childrenArray.clear(); // or any cleanup
  }
}

  addChild() {
    const items = this.myForm.get(RegisterFormModules.CHILDREN).get(RegisterFormControls.CHILDREN) as FormArray;
    items.push(
      this.formBuilder.group({
        [RegisterFormControls.CHILD_FIRST_NAME]: new FormControl(
          '', [Validators.required, Validators.pattern(/^[A-Za-zא-ת ]+$/)]
        ),
        [RegisterFormControls.CHILD_LAST_NAME]: new FormControl(
          '', [Validators.required, Validators.pattern(/^[A-Za-zא-ת ]+$/)]
        ),
        // [RegisterFormControls.CHILD_ID]: new FormControl(
        //   '', [Validators.required, Validators.pattern(/^\d{9}$/)]
        // ),
        [RegisterFormControls.CHILD_DATE_OF_BIRTH]: new FormControl(
          '', Validators.required,
        )
      })
    );
  }

  removeChild(index: number) {
    const items = this.myForm.get(RegisterFormModules.CHILDREN).get(RegisterFormControls.CHILDREN) as FormArray;
    items.removeAt(index);
  }


  handleFormRegister() {
    this.authService.error$.next(null);
    const formData = cloneDeep(this.myForm.value);
    formData.validation = { password: formData?.personal?.password };
    console.log("date is ", formData.personal.dateOfBirth);
    
    console.log("formData is :::: ", formData);
    const data = { fromReg: false, email: formData.email };
    this.authService.SignUp(formData).subscribe(() => {
      this.router.navigate(['login'], { queryParams: { from: 'register' } })
    })
  }

  onBackBtnClicked(): void {
    switch (this.selectedFormModule) {
      case RegisterFormModules.VALIDATION:
        if (this.isIndependent() || this.isSpouseIndependent()) {
          this.selectedFormModule = RegisterFormModules.BUSINESS;
          this.setSelectedNavItem(RegisterFormModules.BUSINESS);
        } else {
          this.selectedFormModule = RegisterFormModules.CHILDREN;
          this.setSelectedNavItem(RegisterFormModules.CHILDREN);
        }
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
    console.log("previous form is ", this.selectedFormModule);
    switch (this.selectedFormModule) {
      case RegisterFormModules.BUSINESS:
        this.handleFormRegister();
        console.log("currnet form is ", this.selectedFormModule);
        break;
      case RegisterFormModules.PERSONAL:
        if (this.isMarried()) {
          this.selectedFormModule = RegisterFormModules.SPOUSE;
          this.setSelectedNavItem(RegisterFormModules.SPOUSE);
        } else if (this.isSingle() && this.isIndependent()) {
          this.selectedFormModule = RegisterFormModules.BUSINESS;
          this.setSelectedNavItem(RegisterFormModules.BUSINESS);
        } else if (this.isSingle() && !this.isIndependent()) {
          this.handleFormRegister();
          // this.selectedFormModule = RegisterFormModules.VALIDATION;
          // this.setSelectedNavItem(RegisterFormModules.VALIDATION)
        } else {
          this.selectedFormModule = RegisterFormModules.CHILDREN;
          this.setSelectedNavItem(RegisterFormModules.CHILDREN);
        }
        console.log("currnet form is ", this.selectedFormModule);
        break;
      case RegisterFormModules.CHILDREN:
        if (this.isIndependent() || this.isSpouseIndependent()) {
          this.selectedFormModule = RegisterFormModules.BUSINESS;
          this.setSelectedNavItem(RegisterFormModules.BUSINESS);
        } else {
          this.selectedFormModule = RegisterFormModules.VALIDATION;
          this.setSelectedNavItem(RegisterFormModules.VALIDATION);
        }
        console.log("currnet form is ", this.selectedFormModule);
        break;
      case RegisterFormModules.SPOUSE:
        this.selectedFormModule = RegisterFormModules.CHILDREN;
        this.setSelectedNavItem(RegisterFormModules.CHILDREN)
        console.log("currnet form is ", this.selectedFormModule);
        break;
      // case RegisterFormModules.BUSINESS:
      //   this.selectedFormModule = RegisterFormModules.VALIDATION;
      //   this.setSelectedNavItem(RegisterFormModules.VALIDATION)
      //   break;
    }
  }

  // onNextBtnClicked(): void {
  //   console.log("selectedFormModule 1: ", this.selectedFormModule);
  //   switch (this.selectedFormModule) {
  //     case RegisterFormModules.VALIDATION:
  //       this.handleFormRegister();
  //       break;
  //     case RegisterFormModules.PERSONAL:
  //       if (this.isMarried()) {
  //         this.selectedFormModule = RegisterFormModules.SPOUSE;
  //         this.setSelectedNavItem(RegisterFormModules.SPOUSE);
  //         console.log("selectedFormModule 2: ", this.selectedFormModule);
  //       } else if (this.isSingle() && this.isIndependent()) {
  //         this.selectedFormModule = RegisterFormModules.BUSINESS;
  //         this.setSelectedNavItem(RegisterFormModules.BUSINESS);
  //       } else if (this.isSingle() && !this.isIndependent()) {
  //         this.selectedFormModule = RegisterFormModules.VALIDATION;
  //         this.setSelectedNavItem(RegisterFormModules.VALIDATION)
  //       } else {
  //         this.selectedFormModule = RegisterFormModules.CHILDREN;
  //         this.setSelectedNavItem(RegisterFormModules.CHILDREN);
  //       }
  //       break;
  //     case RegisterFormModules.CHILDREN:
  //       if (this.isIndependent() || this.isSpouseIndependent()) {
  //         this.selectedFormModule = RegisterFormModules.BUSINESS;
  //         this.setSelectedNavItem(RegisterFormModules.BUSINESS);
  //       } else {
  //         this.selectedFormModule = RegisterFormModules.VALIDATION;
  //         this.setSelectedNavItem(RegisterFormModules.VALIDATION);
  //       }
  //       break;
  //     case RegisterFormModules.SPOUSE:
  //       this.selectedFormModule = RegisterFormModules.CHILDREN;
  //       this.setSelectedNavItem(RegisterFormModules.CHILDREN)
  //       break;
  //     case RegisterFormModules.BUSINESS:
  //       this.selectedFormModule = RegisterFormModules.VALIDATION;
  //       this.setSelectedNavItem(RegisterFormModules.VALIDATION)
  //       break;
  //   }
  // }

  // checkPassword(event: string) {
  //   const realPass = this.myForm.get(RegisterFormModules.VALIDATION)?.get(RegisterFormControls.PASSWORD)?.value;
  //   if (event === realPass) {
  //     this.passwordValid = true;
  //   } else {
  //     this.passwordValid = false;
  //   }
  // }

  checkPassword() {
    const passwordsValid = this.validationForm.errors?.passwordsMismatch;
    console.log("passwordsValid: ", passwordsValid);
    const password = this.myForm.get(RegisterFormModules.VALIDATION).get(RegisterFormControls.PASSWORD)?.value;
    const confirmPassword = this.myForm.get(RegisterFormModules.VALIDATION)?.get(RegisterFormControls.CONFIRM_PASSWORD)?.value;

    this.passwordValid = passwordsValid;
    return password === confirmPassword ? null : { passwordsMismatch: true };

  }

  navigateclicked(event: IItemNavigate): void {
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

  private isCurrentFormValid(): boolean {
    switch (this.selectedFormModule) {
      case RegisterFormModules.PERSONAL:
        return this.personalForm.valid;
      case RegisterFormModules.CHILDREN:
        return this.childrenForm.valid;
      case RegisterFormModules.SPOUSE:
        return this.spouseForm.valid;
      case RegisterFormModules.BUSINESS:
        return this.businessForm.valid;
      case RegisterFormModules.VALIDATION:
        const baseFormValidation = this.personalForm.valid && this.businessForm.valid && this.validationForm.valid;
        if (this.isSingle()) {
          return baseFormValidation;
        } else if (this.isMarried()) {
          return baseFormValidation && this.spouseForm.valid && this.childrenForm.valid;
        } else {
          return baseFormValidation && this.childrenForm.valid;
        }
    }
  }

  private matchPasswords(formGroup: AbstractControl): { [key: string]: boolean } | null {
    const password = formGroup.get(RegisterFormControls.PASSWORD)?.value;
    const confirmPassword = formGroup.get(RegisterFormControls.CONFIRM_PASSWORD)?.value;

    if (!password || !confirmPassword) {
      return null; // Valid until both fields are filled
    }

    return password === confirmPassword ? null : { passwordsMismatch: true };
  }

  // private confirmPasswordValidator(control: AbstractControl) {
  //   const confirmPassword = control?.value;

  //   if (!confirmPassword) {
  //     return null;
  //   }

  //   if (confirmPassword === control?.parent?.get('password')?.value) {
  //     // input is valid
  //     return null;
  //   }

  //   // input is not valid
  //   return {
  //     match: false
  //   }
  // }

  private isSingle(): boolean {
    return this.personalForm?.get(RegisterFormControls.FAMILYSTATUS)?.value === FamilyStatus.SINGLE;
  }

  private isMarried(): boolean {
    return this.personalForm?.get(RegisterFormControls.FAMILYSTATUS)?.value === FamilyStatus.MARRIED;
  }

  isIndependent(): boolean {
    return (this.personalForm?.get(RegisterFormControls.EMPLOYEMENTSTATUS)?.value === EmploymentType.SELF_EMPLOYED ||
      this.personalForm?.get(RegisterFormControls.EMPLOYEMENTSTATUS)?.value === EmploymentType.BOTH);
  }

  isSpouseIndependent(): boolean {
    return (this.spouseForm?.get(RegisterFormControls.SPOUSEEMPLOYEMENTSTATUS)?.value === EmploymentType.SELF_EMPLOYED ||
      this.spouseForm?.get(RegisterFormControls.SPOUSEEMPLOYEMENTSTATUS)?.value === EmploymentType.BOTH);
  }

  resetBusinessSpouseDetails(): void {
    if (this.spouseForm?.get(RegisterFormControls.SPOUSEEMPLOYEMENTSTATUS)?.value === EmploymentType.EMPLOYEE) {
      this.businessForm.get(RegisterFormControls.SPOUSEBUSINESSNAME).patchValue(null);
      this.businessForm.get(RegisterFormControls.SPOUSEBUSINESSTYPE).patchValue(null);
      this.businessForm.get(RegisterFormControls.SPOUSEBUSINESSDATE).patchValue(null);
      this.businessForm.get(RegisterFormControls.SPOUSEBUSINESSNUMBER).patchValue(null);
      this.businessForm.get(RegisterFormControls.SPOUSEBUSINESSINVENTORY).patchValue(null);
    }
  }

  resetBusinessDetails(): void {
    if (this.personalForm?.get(RegisterFormControls.EMPLOYEMENTSTATUS)?.value === EmploymentType.EMPLOYEE) {
      this.businessForm.get(RegisterFormControls.BUSINESSNAME).patchValue(null);
      this.businessForm.get(RegisterFormControls.BUSINESSTYPE).patchValue(null);
      this.businessForm.get(RegisterFormControls.BUSINESSDATE).patchValue(null);
      this.businessForm.get(RegisterFormControls.BUSINESSNUMBER).patchValue(null);
      this.businessForm.get(RegisterFormControls.BUSINESSINVENTORY).patchValue(null);
    }
  }
}