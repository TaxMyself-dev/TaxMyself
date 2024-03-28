import { Component, EventEmitter, Input, OnInit, Output, ViewChild } from '@angular/core';
import { ButtonSize } from '../button/button.enum';

@Component({
  selector: 'app-popup-message',
  templateUrl: './popup-message.component.html',
  styleUrls: ['./popup-message.component.scss'],
})
export class PopupMessageComponent  implements OnInit {

  @Input() message: string = "";
  @Input() buttonTextConfirm: string = "";
  @Input() buttonTextCancel: string = "";

  @Output() onConfirmClicked: EventEmitter<boolean> = new EventEmitter<boolean>();
  @Output() onCancelClicked: EventEmitter<boolean> = new EventEmitter<boolean>();

  readonly ButtonSize = ButtonSize;
  constructor() { }

  ngOnInit() {}

  confirm() {
    this.onConfirmClicked.emit(true);
  }

  cancel(): void {
    this.onCancelClicked.emit(false);
  }
}
