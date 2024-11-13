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

//   convertTimestampToDateInput(timestamp: number): string {
//     const date = new Date(timestamp * 1000);  // Convert timestamp to Date object
//     const day = String(date.getUTCDate()).padStart(2, '0');  // Get the day and pad with 0 if necessary
//     const month = String(date.getUTCMonth() + 1).padStart(2, '0');  // Get the month and pad with 0
//     const year = date.getUTCFullYear();  // Get the year

//     return `${day}-${month}-${year}`;  // Format as dd-MM-yyyy
// }


//   timestampToDateStr(timestamp: number): string {
//     let date: Date;

//     if (typeof timestamp === 'string') {
//       const parsedTimestamp = parseInt(timestamp);
//       if (isNaN(parsedTimestamp)) {
//         throw new Error('Invalid timestamp string');
//       }
//       date = new Date(parsedTimestamp * 1000);

//     }
//     else {
//       date = new Date(timestamp * 1000);
//     }
//     const day = String(date.getDate()).padStart(2, '0');
//     const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
//     const year = date.getFullYear().toString().slice(-2);

//     return `${day}/${month}/${year}`;
//   }

//   convertDateStrToTimestamp(dateString: string): number {
//     // Split the date string by '/' to get day, month, and year
//     const [day, month, year] = dateString.split('/').map(Number);
  
//     // Note: Month in JavaScript's Date object is 0-indexed (0 for January, 11 for December)
//     const date = new Date(year, month - 1, day);
  
//     // Get the timestamp
//     const timestamp = date.getTime();
  
//     console.log(timestamp); // Outputs the timestamp
//     return timestamp;
//   }
  
//   Example usage
  
  
}