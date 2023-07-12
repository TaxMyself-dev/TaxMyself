import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-button',
  templateUrl: './button.component.html',
  styleUrls: ['./button.component.scss'],
})
export class ButtonComponent  implements OnInit {

  @Input() buttonText: string = '';
  @Output() onButtonClicked: EventEmitter<void> = new EventEmitter();
  
  constructor() { }

  ngOnInit() {}

  onClick(): void {
    this.onButtonClicked.emit();
  }
}
