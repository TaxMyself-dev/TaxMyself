import { Component, OnInit, Output, Input, EventEmitter } from '@angular/core';
import { FormGroup } from '@angular/forms';

@Component({
    selector: 'app-select-year',
    templateUrl: './select-year.component.html',
    styleUrls: ['./select-year.component.scss'],
    standalone: false
})

export class SelectYearComponent implements OnInit {
  @Input() parentForm: FormGroup;
  @Input() errorText: string;
  @Input() disabled: boolean;

  @Output() yearChanged = new EventEmitter<number>();

  years: ({value: number; name: number})[] = [];
  selectedYear: number | null = null;

  constructor() { }

  ngOnInit(): void {
    this.generateYears();
  }

  generateYears(): void {
    const currentYear = new Date().getFullYear();
    for (let i = 0; i <= 20; i++) {
      this.years.push({name: currentYear - i, value: currentYear - i});
    }
    this.years; 
  }
}
