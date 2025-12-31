import { Component, input, OnInit, output, signal } from '@angular/core';
import { DrawerModule } from 'primeng/drawer';
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize } from '../button/button.enum';
@Component({
  selector: 'app-left-panel',
  templateUrl: './left-panel.component.html',
  styleUrls: ['./left-panel.component.scss'],
  imports: [DrawerModule, ButtonComponent],
})
export class LeftPanelComponent  implements OnInit {
  backEnabled = input<boolean>(false);
  headerText = input<string>("");
  backEnabledText = input<string>('חזור');
  subHeaderText = input<string>("");
  visible = input<boolean>(false);
  visibleChanged = output<boolean>();
  backEnabledClicked = output<boolean>();


  buttonSize = ButtonSize;
  buttonColor = ButtonColor;
  constructor() { }

  ngOnInit() {}

  onVisibleChange(event: boolean): void {
    this.visibleChanged.emit(event);
  }

  onBackEnabled(): void {
    this.backEnabledClicked.emit(false);
  }
}
