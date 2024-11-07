import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ButtonSize } from '../button/button.enum';
import { ModalController } from '@ionic/angular';

@Component({
  selector: 'app-popup-message',
  templateUrl: './popup-message.component.html',
  styleUrls: ['./popup-message.component.scss'],
})
export class PopupMessageComponent  implements OnInit {

  @Input() message: string = "";
  @Input() buttonTextConfirm: string = "";
  @Input() buttonTextCancel: string = "";

  //@Output() onConfirmClicked: EventEmitter<boolean> = new EventEmitter<boolean>();
  //@Output() onCancelClicked: EventEmitter<boolean> = new EventEmitter<boolean>();

  readonly ButtonSize = ButtonSize;
  constructor(private modalController: ModalController) { }

  ngOnInit() {}

  confirm() {
    this.modalController.dismiss(true)
    //this.onConfirmClicked.emit(true);
  }
  
  cancel(): void {
    //this.onCancelClicked.emit(false);
    this.modalController.dismiss(false)
  }
}
