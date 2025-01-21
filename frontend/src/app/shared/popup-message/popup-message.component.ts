import { Component, Inject, Input, OnInit } from '@angular/core';
import { ButtonSize } from '../button/button.enum';
import { PopoverController } from '@ionic/angular';

@Component({
  selector: 'app-popup-message',
  templateUrl: './popup-message.component.html',
  styleUrls: ['./popup-message.component.scss'],
})
export class PopupMessageComponent implements OnInit {


  @Input() message: string = "";

  readonly buttonSize = ButtonSize;

  constructor(private popoverController: PopoverController) { }

  ngOnInit() { }

  cancel(): void {
    this.popoverController.dismiss()
  }
}
