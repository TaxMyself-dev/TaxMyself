import { Component, inject, input, OnInit, output, signal, WritableSignal } from '@angular/core';
import { ButtonComponent } from "../button/button.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { LeftPanelComponent } from "../left-panel/left-panel.component";
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ButtonSize, iconPosition } from '../button/button.enum';
import { inputsSize } from 'src/app/shared/enums';
import { ISelectItem } from 'src/app/shared/interface';
import { InputTextComponent } from "../input-text/input-text.component";
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';

@Component({
  selector: 'app-add-category',
  templateUrl: './add-category.component.html',
  styleUrls: ['./add-category.component.scss'],
  imports: [ButtonComponent, InputSelectComponent, LeftPanelComponent, InputTextComponent],
})
export class AddCategoryComponent  implements OnInit {
  transactionService = inject(TransactionsService);
  formBuilder = inject(FormBuilder);
  isVisible = input<boolean>(false);
  editMode = input<boolean>(true);
  categoryList = signal<ISelectItem[]>([]);

  visibleChange = output<boolean>();
  // classifyTranButtonClicked = output<any>();
  openAddCategoryClicked = output<{state: boolean; editMode: boolean }>();
  openAddSubCategoryClicked = output<{state: boolean; editMode: boolean }>();

  isLoading: WritableSignal<boolean> = signal(false);
  groupedSubCategory: WritableSignal<{ label: string; items: any; }[]> = signal([{ label: "", items: [] }]);


  // userData: IUserData;

  buttonSize = ButtonSize;
  inputsSize = inputsSize;
  iconPos = iconPosition;
  
  myForm: FormGroup;

  constructor() {
    this.myForm = this.formBuilder.group({
      category: new FormControl(
        '', [Validators.required]
      ),
      subCategory: new FormControl(
        '', [Validators.required]
      ),
    });
   }

  ngOnInit() {
    this.categoryList = this.transactionService.categories;
    console.log("🚀 ~ AddCategoryComponent ~ ngOnInit ~ this.editMode:", this.editMode())
  }

  onVisibleChange(visible: boolean) {
    this.visibleChange.emit(visible);
  }

  onButtonClicked(event: any): void {
    this.isLoading.set(true);
  }

  onBackEnabled(visible: boolean): void {
    this.visibleChange.emit(visible);
  }

  AddSubCategory(): void {

  }
}
