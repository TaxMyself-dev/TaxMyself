import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { LoadingController } from '@ionic/angular';
import { Observable } from 'rxjs';

export interface Client {
  id: string;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class ClientPanelService {

  token: string;

  constructor(private http: HttpClient, private loader: LoadingController) { 
    this.token = localStorage.getItem('token');
  }

  getMyClients(): Observable<any> {
    const token = localStorage.getItem('token');
    const agent = localStorage.getItem('firebaseUserData');
    const agentId = JSON.parse(agent).uid;
    console.log("agentId is ", agentId);
    
    const url = `${environment.apiUrl}delegations/users-for-agent/${agentId}`;
    const headers = {
      'token': token
    }
    return this.http.get<Client[]>(url, { headers });
  }


  // Send an invitation to the backend
  sendInvitation(email: string): Observable<any> {
    const token = localStorage.getItem('token'); // Retrieve the token for authorization
    const url = `${environment.apiUrl}delegations/invite`;
    const headers = {
      'token': token
    }
    // Make the POST request to the backend API
    return this.http.post(url, { email }, { headers });
  }

}
