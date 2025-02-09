import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { LoadingController } from '@ionic/angular';
import { Observable, BehaviorSubject, of, map } from 'rxjs';

export interface Client {
  id: string;
  name: string;
}

@Injectable({
  providedIn: 'root'
})
export class ClientPanelService {
  private token: string | null;
  private cachedClients: Client[] = [];
  private clientsLoaded = false; // ✅ Tracks if cache is initialized
  private selectedClientIdSubject = new BehaviorSubject<string | null>(null); // ✅ Store selected client
  selectedClientId$ = this.selectedClientIdSubject.asObservable(); // ✅ Observable for UI updates

  constructor(private http: HttpClient, private loader: LoadingController) { 
    this.token = localStorage.getItem('token');
  }

  // ✅ Store the selected client ID (used when the agent selects a client)
  setSelectedClientId(clientUserId: string) {
    this.selectedClientIdSubject.next(clientUserId);
  }

  // ✅ Retrieve the selected client ID
  getSelectedClientId(): string | null {
    return this.selectedClientIdSubject.value;
  }


  getMyClients(): Observable<{ id: string, name: string }[]> {
    
    if (this.clientsLoaded) {
      console.log("✅ Returning cached clients:", this.cachedClients);
      return new Observable(observer => {
        observer.next(this.cachedClients);
        observer.complete();
      });
    }

    const token = localStorage.getItem('token');
    const agent = localStorage.getItem('firebaseUserData');
    const agentId = JSON.parse(agent).uid;
  
    console.log("🔄 Fetching clients for agentId:", agentId);
  
    const url = `${environment.apiUrl}delegations/users-for-agent/${agentId}`;
    const headers = {
      Authorization: `Bearer ${token}`
    };
  
    return this.http.get<{fullName: string, firebaseId: string} [] >(url).pipe(
      map(response => {
        console.log("response is ", response);
        
        //Ensure users exist and is an array
        if (!response) {
          console.error('Unexpected API response:', response);
          return [];
        }

        //Convert response into { id, name } format
        const clients = response.map(user => ({
          id: user.firebaseId,
          name: user.fullName,
        }));

        //Store in cache
        this.cachedClients = clients;
        this.clientsLoaded = true;

        return clients;
  
        // // ✅ Map each user to { id, name }
        // return response.map(user => ({
        //   id: user.firebaseId, // ✅ Firebase ID as the user ID
        //   name: user.fullName, // ✅ Full Name as the user Name
        // }));
      })
    );
  }


  getFullNameById(userId: string): string | null {
    const user = this.cachedClients.find(client => client.id === userId);
    return user ? user.name : null;
  }


  // // ✅ Fetch transactions (bills) for the selected client
  // getAllBills(): Observable<any[]> {
  //   const token = localStorage.getItem('token');
  //   const clientUserId = this.getSelectedClientId(); // ✅ Get selected client

  //   if (!token) {
  //     console.error('No token found in localStorage!');
  //     return of([]);;
  //   }

  //   const url = `${environment.apiUrl}transactions/get-bills`;

  //   let headers = new HttpHeaders({
  //     Authorization: `Bearer ${token}`, // ✅ Send the token properly
  //   });

  //   // ✅ If acting on behalf of a client, add `x-client-user-id`
  //   if (clientUserId) {
  //     headers = headers.set('x-client-user-id', clientUserId);
  //   }

  //   return this.http.get<any[]>(url, { headers });
  // }

  // ✅ Send an invitation to a new client
  sendInvitation(email: string): Observable<any> {
    const token = localStorage.getItem('token'); // Retrieve the token for authorization
    const url = `${environment.apiUrl}delegations/invite`;
    const headers = {
      Authorization: `Bearer ${token}`
    };

    return this.http.post(url, { email }, { headers });
  }
}


// import { Injectable } from '@angular/core';
// import { HttpClient, HttpParams } from '@angular/common/http';
// import { environment } from 'src/environments/environment';
// import { LoadingController } from '@ionic/angular';
// import { Observable } from 'rxjs';

// export interface Client {
//   id: string;
//   name: string;
// }

// @Injectable({
//   providedIn: 'root'
// })
// export class ClientPanelService {

//   token: string;

//   constructor(private http: HttpClient, private loader: LoadingController) { 
//     this.token = localStorage.getItem('token');
//   }

//   getMyClients(): Observable<any> {
//     const token = localStorage.getItem('token');
//     const agent = localStorage.getItem('firebaseUserData');
//     const agentId = JSON.parse(agent).uid;
//     console.log("agentId is ", agentId);
    
//     const url = `${environment.apiUrl}delegations/users-for-agent/${agentId}`;
//     const headers = {
//       'token': token
//     }
//     return this.http.get<Client[]>(url, { headers });
//   }


//   // Send an invitation to the backend
//   sendInvitation(email: string): Observable<any> {
//     const token = localStorage.getItem('token'); // Retrieve the token for authorization
//     const url = `${environment.apiUrl}delegations/invite`;
//     const headers = {
//       'token': token
//     }
//     // Make the POST request to the backend API
//     return this.http.post(url, { email }, { headers });
//   }

// }
