import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class MyPermissionsService {
  constructor(private http: HttpClient) {}

  /** רשימת המשתמשים שיש להם הרשאה על הנתונים שלי (ההרשאות שלי) */
  getMyPermissions(): Observable<{ agentId: string; email: string; fullName: string; scopes: string[] }[]> {
    const url = `${environment.apiUrl}delegations/my-permissions`;
    return this.http.get<any>(url);
  }

  /** מתן הרשאה לצפייה בלבד למשתמש לפי אימייל. שולח מייל למשתמש. */
  grantViewPermission(email: string): Observable<{ message: string }> {
    const url = `${environment.apiUrl}delegations/grant-view`;
    return this.http.post<{ message: string }>(url, { email: email.trim() });
  }
}
