export class ShaamDateUtil {
  /**
   * Validates and formats date to YYYY-MM-DD
   * @param date - Date string or Date object
   * @returns Formatted date string in YYYY-MM-DD format
   * @throws Error if date is invalid
   */
  static formatDate(date: string | Date): string {
    let dateObj: Date;
    
    if (typeof date === 'string') {
      dateObj = new Date(date);
    } else {
      dateObj = date;
    }
    
    if (isNaN(dateObj.getTime())) {
      throw new Error('Invalid date provided');
    }
    
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }

  /**
   * Validates date string is in YYYY-MM-DD format
   */
  static isValidDateFormat(date: string): boolean {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    return regex.test(date);
  }
}


