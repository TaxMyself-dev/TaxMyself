import { Component, computed, effect, OnDestroy, OnInit, signal } from '@angular/core';
import { FormBuilder, FormGroup, Validators, FormControl, FormArray, AbstractControl, ValidatorFn, ValidationErrors } from '@angular/forms';
import { RegisterService } from './register.service';
import { IRegisterLoginImage, ISelectItem } from 'src/app/shared/interface';
import { AuthService } from 'src/app/services/auth.service';
import { Router } from '@angular/router';
import { RegisterFormControls, RegisterFormModules } from './regiater.enum';
import { catchError, EMPTY, finalize, map, startWith, Subject, takeUntil, tap } from 'rxjs';
import { cloneDeep } from 'lodash';
import { businessTypeOptionsList, EmploymentType, employmentTypeOptionsList, familyStatusOptionsList } from 'src/app/shared/enums';
import { FamilyStatus, FormTypes } from 'src/app/shared/enums';
import { inputsSize } from 'src/app/shared/enums';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-register',
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss', '../../shared/shared-styling.scss'],
  standalone: false
})
export class RegisterPage implements OnInit, OnDestroy {
 


  readonly inputsSize = inputsSize;
  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;
  readonly registerFormModules = RegisterFormModules;
  readonly registerFormControls = RegisterFormControls;
  readonly formTypes = FormTypes;

  readonly registerImages: IRegisterLoginImage[] = [
    {
      src: "assets/Signup_gallery_personal.svg",
      alt: 'תמונת רקע של פרטיים אישיים',
      title: "שמירת כל המסמכים בענן",
      subTitle: "כל תיעוד ההכנסות וההוצאות מגובה בענן מוכן לשליחה, הורדה, או סתם לומר שלום",
      colorText: '#1A2641',
      page: RegisterFormModules.PERSONAL,
      posText: 'top'
    },
        {
      src: "assets/Signup_gallery_spouse.svg",
      alt: 'תמונת רקע של פרטי בן זוג ',
      title: "חיבור לחשבונות הבנק וכרטיסי האשראי",
      subTitle: "גם לשלוט בתזרים במקום אחד וגם להפריד בקלות בין העסק לבית כך שלא תפספסו אף הוצאה.",
      colorText: '#EBFD71',
      page: RegisterFormModules.SPOUSE,
      posText: 'bottom'
    },
       {
      src: "assets/Signup_gallery_children.svg",
      alt: 'תמונת רקע של פרטיים אישיים',
      title: "הפקת דוחות בקליק",
      subTitle: "הפלטפורמה מאפשרת לכם להפיק דוחות בקלות ובנוחות מתוך התזרים בקליק אחד ובלי מאמץ",
      colorText: '#1A2641',
      page: RegisterFormModules.CHILDREN,
      posText: 'top'
    },
        {
      src: "assets/Signup_gallery_business.svg",
      alt: 'תמונת רקע של פרטי בן זוג ',
      title: "הפקת חשבוניות וקבלות בקלות",
      subTitle: "הפקת קבלות וחשבוניות לעסק בקלות וביעילות",
      colorText: '#1A2641',
      page: RegisterFormModules.BUSINESS,
      posText: 'bottom'
    }
  ]
  

  private ngUnsubscribe = new Subject();

  cities = signal<ISelectItem[]>([]);
  selectedFormModule = signal<RegisterFormModules>(this.registerFormModules.PERSONAL);
  hasChildren = signal<boolean>(false);
  level = signal<string>("שלב 1");
  mainTitle = signal<string>("פרטים אישיים");
  subtitle = signal<string>("היי, אז נתחיל בהיכרות ראשונית...");
  isLoading = signal<boolean>(false);
  myForm: FormGroup;
  employmentTypeOptionsList = employmentTypeOptionsList;
  businessTypeOptionsList = businessTypeOptionsList;
  familyStatusOptionsList = familyStatusOptionsList;
  registerPictureText = signal<string>("שמירת כל המסמכים בענן")
  registerPictureSubText = signal<string>("כל תיעוד ההכנסות וההוצאות מגובה בענן מוכן לשליחה, הורדה, או סתם לומר שלום")
  requierdField: boolean = process.env.NODE_ENV !== 'production' ? false : true;
  // requierdField: boolean = true;

matchRegisterImage = computed(() => {
  const currentModule = this.selectedFormModule();
  return this.registerImages.find(image => image.page === currentModule);
})

  constructor(private router: Router, public authService: AuthService, private formBuilder: FormBuilder, private registerService: RegisterService, private messageService: MessageService) {
    effect(() => {
      const currentModule = this.selectedFormModule();
      switch (currentModule) {
        case RegisterFormModules.PERSONAL:
          this.level.set("שלב 1");
          this.mainTitle.set("פרטים אישיים");
          this.subtitle.set("היי, אז נתחיל בהיכרות ראשונית...");
          break;
        case RegisterFormModules.SPOUSE:
          this.level.set("שלב 2");
          this.mainTitle.set("פרטי בן או בת זוג");
          this.subtitle.set("אוקי... אנחנו מתחילים להכיר באמת");
          break;
        case RegisterFormModules.CHILDREN:
          this.level.set("שלב 3");
          this.mainTitle.set("ילדים");
          this.subtitle.set("אנחנו ממש בשלב הרציני כבר, אה?");
          break;
        case RegisterFormModules.BUSINESS:
          this.level.set("שלב 4");
          this.mainTitle.set("פרטי העסק");
          this.subtitle.set("רק עוד קצת וסיימנו!");
          break;
      }
    })

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
        '', [Validators.required, this.confirmPasswordValidator()])
    });

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
        null, this.requierdField ? [Validators.required, Validators.pattern(/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/)] : null,
      ),
      [RegisterFormControls.SPOUSEGENDER]: new FormControl(
        null, this.requierdField ? [Validators.required] : null,
      ),
    })

    const childrenForm = this.formBuilder.group({
      ["childrenArray"]: this.formBuilder.array([]),
    })

    const businessForm = this.formBuilder.group({
      ["businessArray"]: this.formBuilder.array([]),
    })

    // const businessForm = this.formBuilder.group({
    //   [RegisterFormControls.BUSINESSNAME]: new FormControl(
    //     null, this.requierdField && this.isIndependent() ? Validators.required : null,
    //   ),
    //   [RegisterFormControls.BUSINESSTYPE]: new FormControl(
    //     null, this.requierdField && this.isIndependent() ? Validators.required : null,
    //   ),
    //   // [RegisterFormControls.BUSINESSDATE]: new FormControl(
    //   //   null, this.requierdField && this.isIndependent() ? Validators.required : null,
    //   // ),
    //   [RegisterFormControls.BUSINESSNUMBER]: new FormControl(
    //     null, this.requierdField && this.isIndependent() ? [Validators.required, Validators.pattern(/^\d+$/)] : null,
    //   ),
    //   // [RegisterFormControls.BUSINESSINVENTORY]: new FormControl(
    //   //   null, this.requierdField && this.isIndependent() ? Validators.required : null,
    //   // ),
    //   [RegisterFormControls.SPOUSEBUSINESSNAME]: new FormControl(
    //     null, this.requierdField && this.isMarried() && this.isSpouseIndependent() ? Validators.required : null,
    //   ),
    //   [RegisterFormControls.SPOUSEBUSINESSTYPE]: new FormControl(
    //     null, this.requierdField && this.isMarried() && this.isSpouseIndependent() ? Validators.required : null,
    //   ),
    //   // [RegisterFormControls.SPOUSEBUSINESSDATE]: new FormControl(
    //   //   null, this.requierdField && this.isMarried() && this.isSpouseIndependent() ? Validators.required : null,
    //   // ),
    //   [RegisterFormControls.SPOUSEBUSINESSNUMBER]: new FormControl(
    //     null, this.requierdField && this.isMarried() && this.isSpouseIndependent() ? Validators.required : null,
    //   ),
    //   // [RegisterFormControls.SPOUSEBUSINESSINVENTORY]: new FormControl(
    //   //   null, this.requierdField && this.isMarried() && this.isSpouseIndependent() ? Validators.required : null,
    //   // ),
    // })


    this.myForm = this.formBuilder.group({
      [RegisterFormModules.PERSONAL]: personalForm,
      [RegisterFormModules.SPOUSE]: spouseForm,
      [RegisterFormModules.CHILDREN]: childrenForm,
      [RegisterFormModules.BUSINESS]: businessForm,
    });
  }

  ngOnDestroy(): void {
    this.ngUnsubscribe.complete();
  }

  ngOnInit() {
    this.gelAllCities();
    this.fillDevDefaults();
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
    return this.myForm?.get(RegisterFormModules.CHILDREN).get("childrenArray") as FormArray;
  }

  get businessForm(): FormGroup {
    return this.myForm?.get(RegisterFormModules.BUSINESS) as FormGroup;
  }

  get businessArray(): FormArray {
    return this.myForm?.get(RegisterFormModules.BUSINESS).get("businessArray") as FormArray;
  }

  // get businessForm(): FormGroup {
  //   return this.myForm?.get(RegisterFormModules.BUSINESS) as FormGroup;
  // }

  get isNextButtonDisabled(): boolean {
    return !this.isCurrentFormValid();
  }

  gelAllCities(): void {
  this.registerService.getCities().pipe(
    takeUntil(this.ngUnsubscribe),
    startWith([]),
    map((cities) => {
      console.log("🚀 ~ map ~ cities:", cities);

      const mapped = cities.map((city) => ({
        name: city['שם_ישוב'],
        value: city['שם_ישוב']
      }));

      // ⭐ מיון לפי א״ב בעברית:
      return mapped.sort((a, b) =>
        a.name.localeCompare(b.name, 'he')
      );
    }),
    tap((res) => {
      console.log(res);

      if (res.length) {
        this.cities.set(res.slice(1));
      } else {
        this.cities.set([]);
      }
    }),
  ).subscribe();
}



  // addBusiness() {
  //   const items = this.myForm.get(RegisterFormModules.BUSINESS).get('businessArray') as FormArray;
  //   items.push(
  //     this.formBuilder.group({
  //       [RegisterFormControls.BUSINESSNAME]: new FormControl(
  //         '', [Validators.required]
  //       ),
  //       [RegisterFormControls.BUSINESSNUMBER]: new FormControl(
  //         '', [Validators.required, Validators.pattern(/^\d+$/)]
  //       ),
  //       [RegisterFormControls.BUSINESSTYPE]: new FormControl(
  //         '', Validators.required,
  //       )
  //     })
  //   );
  // }


  addBusiness(title?: string): void {
    this.businessArray.push(
      this.formBuilder.group({
        title: new FormControl(title || ''), // store the title for display
        [RegisterFormControls.BUSINESSNAME]: new FormControl('', this.requierdField ? Validators.required : null),
        [RegisterFormControls.BUSINESSNUMBER]: new FormControl(
          '', this.requierdField ? [Validators.required, Validators.pattern(/^\d+$/)] : null
        ),
        [RegisterFormControls.BUSINESSTYPE]: new FormControl(null, this.requierdField ? Validators.required : null),
      })
    );
  }


  removeBusiness(index: number) {
    const items = this.myForm.get(RegisterFormModules.BUSINESS).get("businessArray") as FormArray;
    items.removeAt(index);
  }


  prepareBusinessLines(): void {
    // Clear previous lines if any (optional)
    this.businessArray.clear();

    // User is independent → add one line
    if (this.isIndependent()) {
      this.addBusiness('פרטי עסק משתמש/ת ראשי');
    }

    // Spouse is independent → add another line
    if (this.isSpouseIndependent()) {
      this.addBusiness('פרטי עסק בן/בת הזוג');
    }

    // If none are independent, ensure no rows remain
    if (!this.isIndependent() && !this.isSpouseIndependent()) {
      this.businessArray.clear();
    }
  }
  

  getBusinessFormByIndex(index: number): FormGroup {
    return this.businessArray.at(index) as FormGroup;
  }

  getChildFormByIndex(index: number): FormGroup {
    return this.childrenArray.at(index) as FormGroup;
  }

  handleHasChildrenChange(checked: boolean): void {
    if (checked) {
      // switch turned ON
      console.log('User has children – add child or show fields');
      this.hasChildren.set(true);
      this.addChild(); // for example
    } else {
      // switch turned OFF
      console.log('User disabled children section');
      this.hasChildren.set(false)
      this.childrenArray.clear(); // or any cleanup
    }
  }

  addChild() {
    const items = this.myForm.get(RegisterFormModules.CHILDREN).get("childrenArray") as FormArray;
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
    const items = this.myForm.get(RegisterFormModules.CHILDREN).get("childrenArray") as FormArray;
    items.removeAt(index);
  }


  handleFormRegister() {
    this.authService.error.set(null);
    const formData = cloneDeep(this.myForm.value);
    formData.validation = { password: formData?.personal?.password };
    console.log("formData is :::: ", formData);
    this.isLoading.set(true);
    this.authService.SignUp(formData)
    .pipe(
      catchError((error) => {
        console.log("🚀 ~ RegisterPage ~ handleFormRegister ~ error:", error);
        
        this.authService.error.set(error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail:"היי אירעה שגיאה והרישום נכשל. נשמח שתנסה שוב",
          sticky: true,
          key: 'br'
        })
        return EMPTY;
      }),
      finalize(() => {
        this.isLoading.set(false);
      })
    )
    .subscribe(() => {
      // this.router.navigate(['login'], { queryParams: { from: 'register', user: formData?.personal?.password } })
      this.router.navigate(['/login'], {
        state: {
          from: 'register',
          email: formData?.personal?.email,
          password: formData?.personal?.password
        }
      });
    })
  }

  onBackBtnClicked(): void {
    switch (this.selectedFormModule()) {
      case RegisterFormModules.BUSINESS:
        if (this.isSingle()) {
          this.selectedFormModule.set(RegisterFormModules.PERSONAL);
        } else {
          this.selectedFormModule.set(RegisterFormModules.CHILDREN);
        }
        break;
      case RegisterFormModules.CHILDREN:
        if (this.isMarried()) {
          this.selectedFormModule.set(RegisterFormModules.SPOUSE);
        } else {
          this.selectedFormModule.set(RegisterFormModules.PERSONAL);
        }
        break;
      case RegisterFormModules.SPOUSE:
        this.selectedFormModule.set(RegisterFormModules.PERSONAL);
        break;
    }
  }

  onNextBtnClicked(): void {
    switch (this.selectedFormModule()) {
      case RegisterFormModules.BUSINESS:
        this.handleFormRegister();
        break;
      case RegisterFormModules.PERSONAL:
        if (this.isMarried()) {
          this.selectedFormModule.set(RegisterFormModules.SPOUSE);
        } else if (this.isSingle() && this.isIndependent()) {
          this.selectedFormModule.set(RegisterFormModules.BUSINESS);
          this.prepareBusinessLines();
        } else if (this.isSingle() && !this.isIndependent()) {
          this.handleFormRegister();
        } else {
          this.selectedFormModule.set(RegisterFormModules.CHILDREN);
        }
        break;
      case RegisterFormModules.CHILDREN:
        if (this.isIndependent() || this.isSpouseIndependent()) {
          this.selectedFormModule.set(RegisterFormModules.BUSINESS);
          this.prepareBusinessLines();
        } else {
          this.handleFormRegister();
        }
        break;
      case RegisterFormModules.SPOUSE:
        this.selectedFormModule.set(RegisterFormModules.CHILDREN);
        break;
    }
  }

  navigateToLogin(): void {
    this.router.navigate(['login']);
  }

  private isCurrentFormValid(): boolean {
    switch (this.selectedFormModule()) {
      case RegisterFormModules.PERSONAL:
        return this.personalForm.valid;
      case RegisterFormModules.CHILDREN:
        return this.childrenForm.valid;
      case RegisterFormModules.SPOUSE:
        return this.spouseForm.valid;
      case RegisterFormModules.BUSINESS:
        return this.businessForm.valid;
      default:
        return false;
    }
  }

  confirmPasswordValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const password = control?.parent?.get('password')?.value;
      const confirmPassword = control?.parent?.get('confirmPassword')?.value;
      if (password !== confirmPassword) {
        return { confirmMismatch: true };
      }

      return null;
    };
  }

  isSingle(): boolean {
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


  private fillDevDefaults(): void {

    if (process.env.NODE_ENV == 'production') return;

    console.log('🧩 Filling default values for dev testing');

    // Personal
    this.personalForm.patchValue({
      fName: 'Elazar',
      lName: 'Harel',
      id: '123456789',
      gender: 'male',
      email: 'test@example.com',
      phone: '0501234567',
      dateOfBirth: '01/01/1990',
      employmentStatus: 'SELF_EMPLOYED',
      city: 'Tel Aviv',
      familyStatus: 'SINGLE',
      password: 'Test1234',
      confirmPassword: 'Test1234',
    });

    // Spouse (optional)
    this.spouseForm.patchValue({
      spouseFName: 'Uriah',
      spouseLName: 'Harel',
      spouseId: '987654321',
      spouseEmail: 'spouse@example.com',
      spousePhone: '0509876543',
      spouseGender: 'female',
    });

    // Children example
    this.addChild(); // ensure at least one child form exists
    this.childrenArray.at(0).patchValue({
      childFName: 'Noam',
      childLName: 'Harel',
      childDate: '01/09/2020',
    });

    // Business array example (if you use dynamic businesses)
    if (this.businessArray && this.businessArray.length === 0) this.addBusiness();
    this.businessArray.at(0).patchValue({
      businessName: 'KeepInTax',
      businessNumber: '555555555',
      businessType: 'LICENSED',
    });
  }

}