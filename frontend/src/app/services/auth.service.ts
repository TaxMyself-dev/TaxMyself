import { Injectable, NgZone, signal } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import { Observable, catchError, from, switchMap, EMPTY, tap, BehaviorSubject, finalize, throwError } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { UserCredential } from '@firebase/auth-types';
import { sendEmailVerification } from '@angular/fire/auth';
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
  private refreshInterval: any;
  private tokenListenerInitialized = false; // Ensure the listener is initialized only once


  constructor(
    private genericService: GenericService,
    public afs: AngularFirestore,
    public afAuth: AngularFireAuth,
    public router: Router,
    private http: HttpClient,
    public ngZone: NgZone,
  ) { }

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
  
  logout(): void {
    this.afAuth.signOut().then(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
  }


  getUserBussinesNumber(): string {
    const userBusinesses = this.getUserBusinessesFromLocalStorage();
    console.log("🚀 ~ AuthService ~ getUserBussinesNumber ~ userBusinesses:", userBusinesses)
    const businessNumber = userBusinesses.businessNumber;
    return businessNumber;
  }



  getUserDataFromLocalStorage(): IUserData | null {
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
          console.log('✅ userData restored from backend');
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


  signIn(): any {
    const url = `${environment.apiUrl}auth/signin`;
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
    console.log("updatedData is ", updatedData);
    const token = localStorage.getItem('token');  // Assuming you have a token stored
    const headers = { 'token': token };  // Add the token to the headers
    const url = `${environment.apiUrl}auth/update-user`;  // Backend endpoint for updating user
    return this.http.patch(url, updatedData, { headers });
  }


  async SignOut() {
    return this.afAuth.signOut().then(() => {
      localStorage.removeItem('userData');
      sessionStorage.removeItem('isLoggedIn');
      this.router.navigate(['login']);
    });
  }


}

