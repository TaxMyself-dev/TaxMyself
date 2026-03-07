import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { LoadingController } from '@ionic/angular';
import { Observable, BehaviorSubject, of, map } from 'rxjs';
import { AuthService } from './auth.service';

/** Client row for accountant panel (from getUsersForAgent). */
export interface Client {
  id: string;
  fName: string;
  lName: string;
  idNumber: string;
  businessStatus: string;
  fullName: string;
}

/** Payload for creating a new client by accountant (הקמת לקוח). */
export interface CreateClientPayload {
  email: string;
  phone: string;
  fName?: string;
  lName?: string;
  id?: string;
  dateOfBirth?: string;
  businessStatus?: string;
  businessName?: string;
}

@Injectable({
  providedIn: 'root',
})
export class ClientPanelService {
  private readonly http = inject(HttpClient);
  private readonly loader = inject(LoadingController);
  private readonly authService = inject(AuthService);

  private cachedClients: Client[] = [];
  private clientsLoaded = false;
  private readonly selectedClientIdSubject = new BehaviorSubject<string | null>(null);
  readonly selectedClientId$ = this.selectedClientIdSubject.asObservable();

  constructor() {}

  setSelectedClientId(clientUserId: string): void {
    this.selectedClientIdSubject.next(clientUserId);
  }

  getSelectedClientId(): string | null {
    return this.selectedClientIdSubject.value;
  }

  /** Clear clients cache so next getMyClients() will refetch from API. */
  clearClientsCache(): void {
    this.clientsLoaded = false;
    this.cachedClients = [];
  }

  /**
   * Fetch the list of clients (לקוחות) for the current accountant.
   * Uses firebaseId from AuthService as agentId.
   */
  getMyClients(): Observable<Client[]> {
    const agentId = this.authService.getUserDataFromLocalStorage()?.firebaseId;
    if (!agentId) return of([]);
    if (this.clientsLoaded) return of(this.cachedClients);

    const url = `${environment.apiUrl}delegations/users-for-agent/${agentId}`;
    return this.http
      .get<{
        firebaseId: string;
        fullName: string;
        fName: string;
        lName: string;
        id: string;
        businessStatus: string;
      }[]>(url)
      .pipe(
        map((response) => {
          if (!response || !Array.isArray(response)) return [];
          const clients: Client[] = response.map((u) => ({
            id: u.firebaseId,
            fullName: u.fullName,
            fName: u.fName,
            lName: u.lName,
            idNumber: u.id,
            businessStatus: u.businessStatus,
          }));
          this.cachedClients = clients;
          this.clientsLoaded = true;
          return clients;
        }),
      );
  }


  getFullNameById(userId: string): string | null {
    const user = this.cachedClients.find((c) => c.id === userId);
    return user ? user.fullName : null;
  }

  /**
   * Create a new client (הקמת לקוח). Backend creates Firebase user (email + password KE+phone),
   * User in DB, and Delegation. Requires current user to have role ACCOUNTANT.
   */
  createClient(payload: CreateClientPayload): Observable<{ firebaseId: string; fullName: string }> {
    const url = `${environment.apiUrl}delegations/create-client`;
    // AuthInterceptor adds Bearer token from Firebase idToken
    return this.http.post<{ firebaseId: string; fullName: string }>(url, payload);
  }

  /** Send invitation email to an existing user to grant access. */
  sendInvitation(email: string): Observable<unknown> {
    const url = `${environment.apiUrl}delegations/invite`;
    // AuthInterceptor adds Bearer token from Firebase idToken
    return this.http.post(url, { email });
  }
}
