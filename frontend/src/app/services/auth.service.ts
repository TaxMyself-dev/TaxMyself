import { Injectable, Injector, NgZone, signal } from '@angular/core';
import { ClientPanelService } from './clients-panel.service';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import { Observable, catchError, firstValueFrom, from, switchMap, EMPTY, tap, BehaviorSubject, finalize, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { User, UserCredential } from '@firebase/auth-types';
import { GoogleAuthProvider, sendEmailVerification } from '@angular/fire/auth';
import { environment } from 'src/environments/environment';
import { ExpenseDataService } from './expense-data.service';
import { GenericService } from './generic.service';
import { IUserData } from '../shared/interface';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  token: string;
  private userDetails: IUserData = null;
  /** כשהרואה חשבון צופה בלקוח – נתוני הלקוח (לא נשמר ב-localStorage) */
  private viewAsUserData: IUserData | null = null;
  private refreshInterval: any;
  private tokenListenerInitialized = false; // Ensure the listener is initialized only once


  constructor(
    private genericService: GenericService,
    public afs: AngularFirestore,
    public afAuth: AngularFireAuth,
    public router: Router,
    private http: HttpClient,
    public ngZone: NgZone,
    private injector: Injector,
  ) { }

  /** Reset any persisted view-as / x-client-user-id state. Called from
   *  logout() and the start of a fresh login so a stale delegated-client id
   *  from a previous session can't ride along on the next request (which
   *  would 403 once the new logged-in user lacks delegation to that client).
   *  Lazy-resolved via Injector to break the circular import with
   *  ClientPanelService (which depends on AuthService). */
  private clearDelegationState(): void {
    this.viewAsUserData = null;
    this.injector.get(ClientPanelService).clearSelectedClient();
  }

  public isLoggedIn$ = new BehaviorSubject<string>("");
  public error = signal<string>("");
  public isVerfyEmail$ = new BehaviorSubject<boolean>(false);
  public isToastOpen$ = new BehaviorSubject<boolean>(false);
  public tokenRefreshed$ = new BehaviorSubject<string | null>(null);

  private activeBusinessNumberSig = signal<string | null>(null);

  setActiveBusinessNumber(bn: string | null) {
    this.activeBusinessNumberSig.set(bn);
  }

  getActiveBusinessNumber(): string | null {
    return this.activeBusinessNumberSig();
  }

  setActiveBusinessNumberByName(businessName: string | null): void {
    console.log("🚀 ~ AuthService ~ setActiveBusinessNumberByName ~ businessName:", businessName)
    if (!businessName) {
      this.setActiveBusinessNumber(null);
      return;
    }

    const match = this.genericService.businessSelectItems().find((item) => item.name === businessName);
    const value = match?.value;

    if (typeof value === 'string') {
      this.setActiveBusinessNumber(value);
      return;
    }

    if (value !== undefined && value !== null) {
      this.setActiveBusinessNumber(String(value));
      return;
    }

    this.setActiveBusinessNumber(null);
  }

  /**
   * The single logout entry point for the entire application. Every logout
   * trigger (settings menu, forced 401 sign-out, etc.) must funnel through here.
   *
   * Clears, in order: in-memory app state (root singletons survive client-side
   * navigation and would otherwise leak into the next session in the same tab),
   * the Firebase auth session, then every auth/user storage key explicitly.
   * Finally redirects to /login with `replaceUrl` so the back button cannot
   * return to a protected page.
   */
  async logout(): Promise<void> {
    // 1. Firebase — await so the persisted session (IndexedDB) is fully cleared
    //    before we tear the app down.
    try {
      await this.afAuth.signOut();
    } catch (err) {
      console.error('Firebase signOut failed during logout:', err);
    }

    // 2. Remove every auth/user-related storage item explicitly (never *.clear()).
    this.clearAuthStorage();

    // 3. Full application reload. Angular boots from scratch, so every singleton
    //    service, signal, computed and in-memory cache is recreated clean — no
    //    manual per-service resets needed. replace() (not assign) so the
    //    authenticated page can't be reached via the Back button.
    window.location.replace('/login');
  }

  /**
   * Explicit allow-list of every auth/user-related storage key written anywhere
   * in the app. Kept explicit (not localStorage.clear()) so unrelated keys are
   * left untouched and every cleared key is auditable.
   */
  private clearAuthStorage(): void {
    const localKeys = [
      'userData',
      'businesses',
      'token',                    // legacy, never written today — cleared defensively
      'shaam_access_token',
      'shaam_token_expires_in',
      'shaam_token_timestamp',
    ];
    const sessionKeys = [
      'isLoggedIn',
      'tm.selectedClientId',
      'tm.selectedClientName',
      'draft_businessNumber',
      'draft_docType',
      'tm.demoSimulateBankLoader',
      'chunkReloadFor',
    ];
    localKeys.forEach((k) => localStorage.removeItem(k));
    sessionKeys.forEach((k) => sessionStorage.removeItem(k));
  }

  /** טעינת נתוני המשתמש "האפקטיבי" – כשהרואה חשבון צופה בלקוח מחזיר נתוני הלקוח */
  loadViewAsUserData(): Observable<IUserData | null> {
    return this.signIn().pipe(
      tap((data: unknown) => {
        this.viewAsUserData = (data as IUserData) ?? null;
      }),
      catchError(() => {
        this.viewAsUserData = null;
        return [null];
      })
    );
  }

  clearViewAsUserData(): void {
    this.viewAsUserData = null;
  }

  /** האם כרגע במצב צפייה כרואה חשבון (לא יכול לערוך/להפיק) */
  isViewingAsClient(): boolean {
    return this.viewAsUserData != null;
  }

  /** True when the currently impersonated user is a demo user. Used to relax
   *  view-as restrictions so a presenter can show all features (including
   *  doc-create) during a live demo, even without ADMIN role. */
  isViewingDemoUser(): boolean {
    const email = this.viewAsUserData?.email ?? '';
    return email.startsWith('demo+') && email.endsWith('@taxmyself.local');
  }


  getUserBussinesNumber(): string {
    const userBusinesses = this.getUserBusinessesFromLocalStorage();
    console.log("🚀 ~ AuthService ~ getUserBussinesNumber ~ userBusinesses:", userBusinesses)
    const businessNumber = userBusinesses.businessNumber;
    console.log("🚀 ~ AuthService ~ getUserBussinesNumber ~ businessNumber:", businessNumber)
    console.log('%c special log', 'color: red; font-size: 20px; font-weight: bold; background-color: black; ', businessNumber)
    return businessNumber;
  }



  getUserDataFromLocalStorage(): IUserData | null {
    if (this.viewAsUserData != null) {
      return this.viewAsUserData;
    }
    return this.getRealUserDataFromLocalStorage();
  }

  /**
   * Returns the *real* logged-in user from localStorage, bypassing any view-as
   * overlay. Use this when you need to know who actually holds the session —
   * e.g., to decide where the "exit client view" button should navigate.
   */
  getRealUserDataFromLocalStorage(): IUserData | null {
    const tempA = localStorage.getItem('userData');
    if (!tempA) {
      return null;
    }
    try {
      return JSON.parse(tempA);
    } catch (error) {
      console.error('Error parsing userData from localStorage:', error);
      return null;
    }
  }

  getUserBusinessesFromLocalStorage(): IUserData | null {
    const tempA = localStorage.getItem('businesses');
    if (!tempA) {
      return null;
    }
    try {
      return JSON.parse(tempA);
    } catch (error) {
      console.error('Error parsing businesses from localStorage:', error);
      return null;
    }
  }

  /**
   * Restore userData from backend when localStorage is missing but user is still logged in
   * @returns Observable that emits the restored userData or null if restoration fails
   */
  restoreUserData(): Observable<IUserData | null> {
    return this.signIn().pipe(
      tap((userData: IUserData) => {
        if (userData) {
          localStorage.setItem('userData', JSON.stringify(userData));
          // console.log('✅ userData restored from backend');
        }
      }),
      catchError((error) => {
        console.error('❌ Failed to restore userData from backend:', error);
        return [null];
      })
    );
  }


  handleErrorLogin(err: string): void {
    console.log("err string: ", err);
    if (err === "auth/user-not-found" || err === "auth/invalid-email" || err === 'auth/invalid-login-credentials' || err === "auth/wrong-password" || err === "auth/invalid-credential") {
      this.error.set("user");
    }
  }


  /**
   * @param freshLogin pass `true` ONLY from the actual login screen. The
   * backend triggers the post-login Feezback sync (and prints the LOGIN
   * banner) only when this flag is set, so session-restore / view-as /
   * page-navigation calls to /auth/signin don't re-trigger a sync.
   */
  signIn(freshLogin = false): any {
    if (freshLogin) {
      // Fresh login: drop any leftover delegated-client id before the
      // request fires, otherwise the AuthInterceptor will attach
      // x-client-user-id from a previous session and the new user
      // (no delegation, no admin role) will get a 403.
      this.clearDelegationState();
    }
    const url = `${environment.apiUrl}auth/signin${freshLogin ? '?freshLogin=true' : ''}`;
    return this.http.get(url);
  }

  getSignupErrorMessage(err: string): string {
    switch (err) {

      case 'auth/email-already-in-use':
        return 'כתובת האימייל כבר רשומה במערכת. נסה להתחבר או להשתמש באימייל אחר.';

      case 'auth/invalid-email':
        return 'כתובת האימייל אינה תקינה. אנא בדוק והזן כתובת נכונה.';

      case 'auth/network-request-failed':
        return 'בעיה בחיבור לאינטרנט. אנא בדוק את החיבור ונסה שוב.';

      case 'auth/user-disabled':
        return 'החשבון שלך הושבת. לפרטים נוספים פנה לתמיכה.';

      case 'auth/user-not-found':
        return 'לא נמצא חשבון עם כתובת האימייל שהוזנה.';

      case 'auth/missing-email':
        return 'יש להזין כתובת אימייל כדי להמשיך.';

      case 'auth/too-many-requests':
        return 'בוצעו יותר מדי ניסיונות בזמן קצר. אנא נסה שוב בעוד מספר דקות.';

      default:
        return 'אירעה שגיאה לא צפויה. אנא נסה שוב מאוחר יותר.';
    }
  }



  SignUp(formData: any): Observable<any> {
    let uid: string = "";
    return from(this.afAuth.createUserWithEmailAndPassword(formData.personal.email, formData.personal.password))
      .pipe(
        catchError((err) => {
          console.log("err in create user: ", err);
          return throwError(() => err);

        }),
        tap((userCredentialData: UserCredential) => uid = userCredentialData.user.uid),
        switchMap((userCredentialData: UserCredential) => from(sendEmailVerification(userCredentialData.user))),
        catchError((err) => {
          console.log("err in send email verify: ", err);
          return throwError(() => err);
        }),
        tap(() => this.isVerfyEmail$.next(true)),
        switchMap(() => {
          const url = `${environment.apiUrl}auth/signup`
          formData.personal.firebaseId = uid;
          return this.http.post(url, formData);

        }),
        catchError((err) => {
          this.afAuth.currentUser.then((user) => {
            user.delete();
          }).catch((err) => {
            console.log("err:", err);
          })
          return throwError(() => err);
        })
      )
  }


  SendVerificationMail(mailAddress?: string, password?: string): Observable<any> {
    return from(this.afAuth.currentUser).pipe(
      switchMap((user) => {
        if (user) {
          // משתמש מחובר – שלח מייל אימות
          return from(user.sendEmailVerification());
        }

        // אם המשתמש לא מחובר אבל יש אימייל וסיסמה – ננסה להתחבר ואז לשלוח מייל
        if (mailAddress && password) {
          return from(this.afAuth.signInWithEmailAndPassword(mailAddress, password)).pipe(
            switchMap((cred) => {
              if (cred.user) {
                return from(cred.user.sendEmailVerification());
              } else {
                return throwError(() => new Error('User not found after login'));
              }
            })
          );
        }

        // אין משתמש ואין פרטי התחברות
        return throwError(() => {
          const err: any = new Error('No user signed in, and no credentials provided');
          err.code = 'auth/user-not-found';
          return err;
        });
      }),
      catchError((err) => {
        console.log("err in send email verify", err);
        return throwError(() => err);
      })
    );
  }




  ForgotPassword(passwordResetEmail: string): Observable<any> {
    return from(this.afAuth.sendPasswordResetEmail(passwordResetEmail));
  }


  get isLoggedIn(): boolean {
    return sessionStorage.getItem('isLoggedIn') ? true : false;
  }


  updateUser(updatedData: any): Observable<any> {
    const url = `${environment.apiUrl}auth/update-user`;
    return this.http.patch(url, updatedData);
  }

  getChildren(): Observable<any[]> {
    const url = `${environment.apiUrl}auth/children`;
    return this.http.get<any[]>(url);
  }

  updateChildren(children: Array<{ childFName: string; childLName: string; childDate: string }>): Observable<any[]> {
    const url = `${environment.apiUrl}auth/children`;
    return this.http.patch<any[]>(url, { children });
  }

  deleteChild(childIndex: number): Observable<void> {
    const url = `${environment.apiUrl}auth/children/${childIndex}`;
    return this.http.delete<void>(url);
  }


  async signInWithGoogle(): Promise<{ isNewUser: boolean; userData?: any; googleUser: { email: string; displayName: string } }> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ hl: 'iw' });
    const result = await this.afAuth.signInWithPopup(provider);
    const googleUser = {
      email: result.user.email,
      displayName: result.user.displayName,
    };
    try {
      // Real login (Google SSO) → freshLogin=true so the post-login sync runs.
      const userData = await firstValueFrom(this.signIn(true));
      return { isNewUser: false, userData, googleUser };
    } catch (err: any) {
      // ONLY treat an explicit 404 (user not found in our DB) as "new user".
      // Any other error (network blip, 500, timeout, auth issue) means "we
      // don't know" — re-throw so the caller surfaces a real error instead of
      // assuming the user is new and deleting their Firebase account.
      if (err?.status === 404) {
        // signInWithPopup() just created this Firebase Auth user, but our DB
        // confirms they were never registered. Remove it now so the email
        // doesn't stay stuck as a ghost account (which later causes
        // "email already in use" when they try to register for real).
        await this.deleteUnregisteredGoogleUser(result.user);
        return { isNewUser: true, googleUser };
      }
      throw err;
    }
  }

  /** Best-effort cleanup for the ghost Firebase user created by
   *  signInWithPopup() when the backend reports the account isn't
   *  registered. Never throws — a freshly-created sign-in is "recent" so
   *  delete() should not need re-authentication, but if it ever fails we log
   *  and let the caller fall through to its existing signOut() + "please
   *  register" handling rather than blocking the user. */
  private async deleteUnregisteredGoogleUser(user: User | null): Promise<void> {
    if (!user) {
      return;
    }
    try {
      await user.delete();
    } catch (deleteErr) {
      console.error('Failed to delete unregistered Google Firebase user:', deleteErr);
    }
  }

}

