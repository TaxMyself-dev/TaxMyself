import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ButtonSize } from '../button/button.enum';
import { ModalController, PopoverController } from '@ionic/angular';

@Component({
    selector: 'app-popup-confirm',
    templateUrl: './popup-confirm.component.html',
    styleUrls: ['./popup-confirm.component.scss'],
    standalone: false
})
export class PopupConfirmComponent  implements OnInit {

  @Input() message: string = "";
  @Input() buttonTextConfirm: string = "";
  @Input() buttonTextCancel: string = "";

  //@Output() onConfirmClicked: EventEmitter<boolean> = new EventEmitter<boolean>();
  //@Output() onCancelClicked: EventEmitter<boolean> = new EventEmitter<boolean>();

  readonly ButtonSize = ButtonSize;
  constructor(private popoverController: PopoverController) { }

  ngOnInit() {}

  confirm() {
    this.popoverController.dismiss(true)
    //this.onConfirmClicked.emit(true);
  }
  
  cancel(): void {
    //this.onCancelClicked.emit(false);
    this.popoverController.dismiss(false)
  }
}
