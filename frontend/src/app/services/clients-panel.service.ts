import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { LoadingController } from '@ionic/angular';
import { Observable, BehaviorSubject, of, map, catchError } from 'rxjs';
import { AuthService } from './auth.service';

/** Client row for accountant panel (from getUsersForAgent). */
export interface Client {
  id: string;
  fName: string;
  lName: string;
  idNumber: string;
  /** סוג העסק: EXEMPT, LICENSED, COMPANY (עוסק פטור, עוסק מורשה, חברה בע"מ) */
  businessType: string;
  fullName: string;
  email: string;
}

/** Payload for creating a new client by accountant (הקמת לקוח). */
export interface CreateClientPayload {
  email: string;
  phone: string;
  fName?: string;
  lName?: string;
  id?: string;
  dateOfBirth?: string;
  businessType?: string;
  businessName?: string;
  businessNumber?: string;
  address?: string;
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
  private readonly selectedClientNameSubject = new BehaviorSubject<string | null>(null);
  readonly selectedClientId$ = this.selectedClientIdSubject.asObservable();
  readonly selectedClientName$ = this.selectedClientNameSubject.asObservable();

  constructor() {}

  setSelectedClientId(clientUserId: string): void {
    this.selectedClientIdSubject.next(clientUserId);
  }

  /** כשנכנסים לחשבון לקוח – שומרים גם את השם לתצוגה בראש המסך */
  setSelectedClient(clientUserId: string, clientName: string): void {
    this.selectedClientIdSubject.next(clientUserId);
    this.selectedClientNameSubject.next(clientName);
  }

  clearSelectedClient(): void {
    this.selectedClientIdSubject.next(null);
    this.selectedClientNameSubject.next(null);
  }

  getSelectedClientId(): string | null {
    return this.selectedClientIdSubject.value;
  }

  getSelectedClientName(): string | null {
    return this.selectedClientNameSubject.value;
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
    return this.http.get(url).pipe(
      map((response: unknown) => {
        const arr = Array.isArray(response) ? response : (response as any)?.data;
        const list = Array.isArray(arr) ? arr : [];
        const clients: Client[] = list.map((u: any) => ({
          id: u?.firebaseId ?? '',
          fullName: [u?.fName, u?.lName].filter(Boolean).join(' ').trim() || u?.fullName || '',
          fName: u?.fName ?? '',
          lName: u?.lName ?? '',
          idNumber: u?.id ?? '',
          businessType: u?.businessType ?? '',
          email: u?.email ?? '',
        }));
        this.cachedClients = clients;
        this.clientsLoaded = true;
        return clients;
      }),
      catchError((err) => {
        console.error('getMyClients failed:', err?.status, err?.error ?? err?.message, err);
        throw err;
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

  /** Remove client from accountant's list (deletes delegation only). */
  deleteClient(clientId: string): Observable<void> {
    const url = `${environment.apiUrl}delegations/client/${encodeURIComponent(clientId)}`;
    return this.http.delete<void>(url);
  }

  /** Send invitation email to an existing user to grant access. */
  sendInvitation(email: string): Observable<unknown> {
    const url = `${environment.apiUrl}delegations/invite`;
    // AuthInterceptor adds Bearer token from Firebase idToken
    return this.http.post(url, { email });
  }
}
