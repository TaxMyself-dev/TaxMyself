import { Component, computed, effect, EventEmitter, inject, Input, input, OnInit, output, Output, Signal, signal, WritableSignal } from '@angular/core';
import { LeftPanelComponent } from "../left-panel/left-panel.component";
import { ButtonComponent } from "../button/button.component";
import { InputSelectComponent } from "../input-select/input-select.component";
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, FormControl } from '@angular/forms';
import { IRowDataTable, ISelectItem } from 'src/app/shared/interface';
import { inputsSize } from 'src/app/shared/enums';
import { ButtonSize } from '../button/button.enum';
import { vi } from 'date-fns/locale';

@Component({
  selector: 'app-account-association-dialog',
  templateUrl: './account-association-dialog.component.html',
  styleUrls: ['./account-association-dialog.component.scss'],
  standalone: true,
  imports: [LeftPanelComponent, ButtonComponent, InputSelectComponent, ReactiveFormsModule]
})

export class AccountAssociationDialogComponent implements OnInit {
  formBuilder = inject(FormBuilder);
  isVisible = input<boolean>(false);
  accounts = input<ISelectItem[]>([]);
  rowData = input<IRowDataTable>(null);
  AccountAssociationButtonClicked = output<string>();
  visibleChange = output<boolean>();
  // visibleState: WritableSignal<boolean> = signal(this.isVisible());

  // visibleState = signal<boolean>(false);
  // visibleState: Signal<boolean> = computed(() => {
  // return this.isVisible()
  // });
  buttonSize = ButtonSize;
  inputsSize = inputsSize;
  // @Output() onShow = new EventEmitter<void>();
  // @Output() onHide = new EventEmitter<void>();
  // @Input() modal = true;
  // @Input() closable = true;
  // @Input() dismissableMask = false;
  // @Input() style = { width: '50vw' };
  // @Input() styleClass?: string;
  // @Input() appendTo?: any;

  myForm: FormGroup;

  constructor() {
    this.myForm = this.formBuilder.group({
      account: new FormControl(
        '', [Validators.required]
      ),
    });
  }

  ngOnInit() {
  }

  onVisibleChange(visible: boolean) {
    this.visibleChange.emit(visible);
  }

  onButtonClicked(event: any): void {
    console.log("🚀 ~ event in AccountAssociationDialogComponent :", event)
    this.AccountAssociationButtonClicked.emit(event);
  }

}
