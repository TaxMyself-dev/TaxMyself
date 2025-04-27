import { Component, inject, input, OnInit, output } from '@angular/core';
import { LeftPanelComponent } from "../left-panel/left-panel.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { ButtonComponent } from "../button/button.component";
import { ButtonSize } from '../button/button.enum';
import { inputsSize } from 'src/app/shared/enums';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { InputTextComponent } from "../input-text/input-text.component";

@Component({
  selector: 'app-add-bill2',
  templateUrl: './add-bill.component.html',
  styleUrls: ['./add-bill.component.scss'],
  imports: [LeftPanelComponent, InputSelectComponent, ButtonComponent, InputTextComponent],
})
export class AddBillComponent  implements OnInit {
  formBuilder = inject(FormBuilder);
  isVisible = input<boolean>(false);
  visibleChange = output<boolean>();
  addBillButtonClicked = output<any>();

  buttonSize = ButtonSize;
  inputsSize = inputsSize;
  myForm: FormGroup;

  constructor() {
    this.myForm = this.formBuilder.group({
      accountName: new FormControl(
        '', [Validators.required]
      ),
      bussinessName: new FormControl(
        '', []
      ),
    });
  }

  ngOnInit() {}

  onVisibleChange(visible: boolean) {
    this.visibleChange.emit(visible);
  }

  onButtonClicked(event: any): void {
    console.log("🚀 ~ event in AccountAssociationDialogComponent :", event)
    this.addBillButtonClicked.emit(event);
  }

  onBackEnabled(visible: boolean): void {
    this.visibleChange.emit(visible);
  }
}
