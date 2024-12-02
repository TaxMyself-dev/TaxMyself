import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { ISelectItem } from '../interface';
import { ModalController } from '@ionic/angular';
import { ButtonSize } from '../button/button.enum';

@Component({
  selector: 'app-popup-select',
  templateUrl: './popup-select.component.html',
  styleUrls: ['./popup-select.component.scss'],
})
export class PopupSelectComponent  implements OnInit {

  @Input() options: ISelectItem[];
  @Input() message: string;

  readonly buttonSize = ButtonSize;

  businessSelect: string = "";

  constructor(private modalController: ModalController) { }

  ngOnInit() {}

  selected(event: any): void {
    this.businessSelect = event.detail.value;
    console.log(this.businessSelect);
    // this.onSelect.emit(event.detail.value);
  }
  
  confirm(): void {
    this.modalController.dismiss(this.businessSelect, 'success')
  }

}
