import { Component, OnInit, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-select-year',
  templateUrl: './select-year.component.html',
  styleUrls: ['./select-year.component.scss']
})

export class SelectYearComponent implements OnInit {

  years: number[] = [];
  selectedYear: number | null = null;
  
  @Output() yearChanged = new EventEmitter<number>();

  constructor() { }

  ngOnInit(): void {
    this.generateYears();
  }

  generateYears(): void {
    const currentYear = new Date().getFullYear();
    for (let i = 0; i <= 20; i++) {
      this.years.push(currentYear - i);
    }
    this.years.reverse(); // If you want the years in ascending order
  }

  onYearChange(event: any): void {
    this.selectedYear = event.target.value;
    this.yearChanged.emit(this.selectedYear);
  }
  
}
