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

  convertStringToDate(date: number): Date {    
    return new Date(date);
  }

  convertTimestampToDateInput(timestamp: number): string {
    return new Date(timestamp * 1000).toISOString().slice(0, 10);
  }


  timestampToDateStr(timestamp: number): string {
    let date: Date;

    if (typeof timestamp === 'string') {
      const parsedTimestamp = parseInt(timestamp);
      if (isNaN(parsedTimestamp)) {
        throw new Error('Invalid timestamp string');
      }
      date = new Date(parsedTimestamp * 1000);

    }
    else {
      date = new Date(timestamp * 1000);
    }
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const year = date.getFullYear().toString().slice(-2);

    return `${day}/${month}/${year}`;
  }
}