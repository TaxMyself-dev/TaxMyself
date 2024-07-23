import { Component, Input, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-generic-input',
  templateUrl: './generic-input.component.html',
  styleUrls: ['./generic-input.component.scss', '../shared-styling.scss'],
})
export class GenericInputComponent  implements OnInit {

  @Input() parentForm: FormGroup;
  @Input() controlName: string;
  @Input() inputLabel: string;
  @Input() errorText = "שדה זה הוא חובה";

  constructor() { }

  ngOnInit() {}

}
