import { ChangeDetectionStrategy, Component, EventEmitter, Input, input, OnInit, output } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { tr } from 'date-fns/locale';
import { SelectModule } from 'primeng/select';
import { inputsSize } from 'src/app/shared/enums';
import { ISelectItem } from 'src/app/shared/interface';
@Component({
  selector: 'app-input-select',
  templateUrl: './input-select.component.html',
  styleUrls: ['./input-select.component.scss'],
  imports: [SelectModule, FormsModule,
    ReactiveFormsModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputSelectComponent  implements OnInit {

  inputsSize = inputsSize;

  parentForm = input<FormGroup>(null);
  items = input<ISelectItem[]>([]);
  controlName = input<string>("");
  placeholder = input<string>("");
  errorText = input<string>("");
  size = input<string>("");
  filter = input<boolean>(true);
  disabled = input<boolean>(false);
  virtualScroll = input<boolean>(false);
  ariaLabel = input<string>("");

  constructor() { }

  ngOnInit() {}

  getinputClasses(): string {
    return [
      this.size(),             
    ]
      .filter(c => !!c)                // remove empty strings
      .join(' ');
  }

 

}
