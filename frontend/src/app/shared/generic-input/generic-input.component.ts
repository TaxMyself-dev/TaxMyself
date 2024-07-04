import { Component, Input, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
  selector: 'app-generic-input',
  templateUrl: './generic-input.component.html',
  styleUrls: ['./generic-input.component.scss', '../search-bar/search-bar.component.scss'],
})
export class GenericInputComponent  implements OnInit {

  @Input() parentForm: FormGroup;
  @Input() controlName: string;
  @Input() inputLabel: string;
  constructor() { }

  ngOnInit() {}

}
