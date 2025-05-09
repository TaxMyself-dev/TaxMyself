import { ChangeDetectionStrategy, Component, EventEmitter, Input, input, OnInit, output } from '@angular/core';
import { FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { inputsSize } from 'src/app/shared/enums';
@Component({
  selector: 'app-input-text',
  templateUrl: './input-text.component.html',
  styleUrls: ['./input-text.component.scss'],
  imports: [FormsModule, ReactiveFormsModule, InputTextModule],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InputTextComponent  implements OnInit {

  inputsSize = inputsSize;

  parentForm = input<FormGroup>(null);
  controlName = input<string>("");
  placeholder = input<string>("");
  errorText = input<string>("");
  labelText = input<string>("");
  ariaLabel = input<string>("");
  size = input<string>("");
  disabled = input<boolean>(false);

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
