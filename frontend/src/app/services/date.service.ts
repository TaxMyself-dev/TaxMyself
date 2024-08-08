import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class DateService {

  constructor() { }

  getTodaysDate(): string {
    const currentDate = new Date();
    return currentDate.toISOString().substring(0, 10);
  }
}