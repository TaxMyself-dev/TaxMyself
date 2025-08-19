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

  //userData: any; // Save logged in user data
  token: string;
  private userDetails: IUserData = null;
  private refreshInterval: any;
  private tokenListenerInitialized = false; // Ensure the listener is initialized only once

  // userDetailsObs$: Observable<IUserDate> = this.userDetails$.asObservable();


  constructor(
    private genericService: GenericService,
    public afs: AngularFirestore,
    public afAuth: AngularFireAuth,
    public router: Router,
    private http: HttpClient,
    public ngZone: NgZone,
  ) { }

  public isLoggedIn$ = new BehaviorSubject<string>("");
  // public error$ = new BehaviorSubject<string>("");
  public error = signal<string>("");
  public isVerfyEmail$ = new BehaviorSubject<boolean>(false);
  public isToastOpen$ = new BehaviorSubject<boolean>(false);
  public tokenRefreshed$ = new BehaviorSubject<string | null>(null);


  // startTokenRefresh() {

  //   if (this.tokenListenerInitialized) return; // Avoid multiple listeners
  //   this.tokenListenerInitialized = true;

  //   // Firebase listener for ID token changes
  //   this.afAuth.onIdTokenChanged(async (user) => {
  //     if (user) {
  //       // Fetch the latest token
  //       const idToken = await user.getIdToken();
  //       const currentTime = new Date().toLocaleString(); // Human-readable time
  //       // console.log(`Token refreshed at ${currentTime}:`, idToken);
  //       console.log("user is ", user);

  //       // Store the token in local storage for easy access
  //       localStorage.setItem('token', idToken);

  //       // Optionally, send the token to the backend for verification
  //     } else {
  //       // User is logged out or the token is invalid
  //       console.log('User is signed out or token has expired');
  //       localStorage.removeItem('token');
  //     }
  //   });
  // }


  // stopTokenRefresh(): void {
  //   if (this.refreshInterval) {
  //     clearInterval(this.refreshInterval);
  //   }
  // }


  logout(): void {
    this.afAuth.signOut().then(() => {
      localStorage.clear();
      //this.stopTokenRefresh(); // Stop refreshing tokens
      console.log('User logged out and token refresh stopped');
    });
  }


  userVerify(email: string, password: string): Observable<UserCredential> {
    return from(this.afAuth.signInWithEmailAndPassword(email, password))
      .pipe(
        catchError((err) => {
          console.log("Error in sign in with email: ", err);
          this.handleErrorLogin(err.code);
          return throwError(() => err);
        }),
        tap((user) => {
          // Store the user information locally after successful login
          localStorage.setItem('firebaseUserData', JSON.stringify(user.user));
        })
      );
  }


  getUserBussinesNumber(): string {
    const userData = this.getUserDataFromLocalStorage();
    const businessNumber = userData.businessNumber;
    return businessNumber;
  }



  getUserDataFromLocalStorage(): IUserData {
    const tempA = localStorage.getItem('userData');
    return JSON.parse(tempA)
  }


  handleErrorLogin(err: string): void {
    console.log("err string: ", err);
    if (err === "auth/user-not-found" || err === "auth/invalid-email" || err === 'auth/invalid-login-credentials' || err === "auth/wrong-password") {
      this.error.set("user");
      // this.error$.next("user");
    }
  }


  signIn(user: UserCredential): any {
    const url = `${environment.apiUrl}auth/signin`
    return from(user.user.getIdToken(true))
      .pipe(
        catchError((err) => {
          console.log("err in get id token: ", err);
          return throwError(() => err);
        }),
        tap((token) => {
          localStorage.setItem('token', token);
        }),
        switchMap(() => this.http.post(url, {})),
        catchError((err) => {
          this.error.set("error");
          // this.error$.next("error");
          console.log("err in post request: ", err);
          return throwError(() => err);
        }),
      )
  }


  handleErrorSignup(err: string): void {
    switch (err) {
      case "auth/email-already-in-use":

        this.error.set("user");
        break;
      case "auth/invalid-email":
        this.error.set("email");
        break;
      case "auth/network-request-failed":
        this.error.set("net");
        break;
      case "auth/user-disabled":
      case "auth/user-not-found":
      case "auth/missing-email":
        this.error.set("disabled");
        break;
      case "auth/too-many-requests":
        this.error.set("many");
        break;
    }
  }


  SignUp(formData: any): Observable<any> {
    let uid: string = "";
    return from(this.afAuth.createUserWithEmailAndPassword(formData.personal.email, formData.personal.password))
      .pipe(
        catchError((err) => {
          console.log("err in create user: ", err);
          this.handleErrorSignup(err.code);
          return throwError(() => err);
          
        }),
        tap((userCredentialData: UserCredential) => uid = userCredentialData.user.uid),
        switchMap((userCredentialData: UserCredential) => from(sendEmailVerification(userCredentialData.user))),
        catchError((err) => {
          this.handleErrorSignup(err.code);
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
          this.handleErrorSignup("auth/network-request-failed");
          return throwError(() => err);
        })
      )
  }


  // SendVerificationMail(): Observable<any> {
  //   const user = this.afAuth.currentUser;

  //   console.log("🚀 ~ AuthService ~ SendVerificationMail ~ user:", user)
  //   return from(this.afAuth.currentUser)
  //   .pipe(
  //       catchError((err) => {
  //         console.log("err in send email verify", err);
  //         return throwError(() => err);
  //       }),
  //       tap((res) => res.sendEmailVerification()),
  //     )
  // }

  // SendVerificationMail(mailAddress?: string): Observable<any> {
  //   return from(this.afAuth.currentUser).pipe(
  //     switchMap((user) => {
  //       if (!user) {
  //         return throwError(() => new Error('User not found'));
  //       }
  //       return from(user.sendEmailVerification());
  //     }),
  //     catchError((err) => {
  //       console.log("err in send email verify", err);
  //       return throwError(() => err);
  //     })
  //   );
  // }

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

  // Returns true when user is looged in and email is verified
  get isLoggedIn(): boolean {
    const user = JSON.parse(localStorage.getItem('firebaseUserData')!);
    return user !== null && user.emailVerified !== false ? true : false;
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
      localStorage.removeItem('firebaseUserData');
      localStorage.removeItem('token');
      this.router.navigate(['login']);
    });
  }


}

