import { Injectable, NgZone } from '@angular/core';
import { AngularFirestore } from '@angular/fire/compat/firestore';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import { Observable, catchError, from, switchMap, EMPTY, tap, BehaviorSubject, finalize } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { UserCredential } from '@firebase/auth-types';
import { sendEmailVerification } from '@angular/fire/auth';
import { environment } from 'src/environments/environment';
import { ExpenseDataService } from './expense-data.service';
import { GenericService } from './generic.service';
import { IUserDate } from '../shared/interface';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  //userData: any; // Save logged in user data
  token: string;
  private userDetails: IUserDate = null;
  // userDetailsObs$: Observable<IUserDate> = this.userDetails$.asObservable();


  constructor(
    private genericService: GenericService,
    public afs: AngularFirestore,
    public afAuth: AngularFireAuth, 
    public router: Router,
    private http: HttpClient,
    public ngZone: NgZone, 
  ) 
  { 
    //this.userDetails = this.getUserDataFromLocalStorage();
  }

  public isLoggedIn$ = new BehaviorSubject<string>("");
  public error$ = new BehaviorSubject<string>("");
  public isVerfyEmail$ = new BehaviorSubject<boolean>(false);
  public isToastOpen$ = new BehaviorSubject<boolean>(false);




  userVerify(email: string, password: string): Observable<UserCredential> {
    // Set token persistence to 'local' (persist the session across browser reloads and sessions)
    return from(this.afAuth.setPersistence('local').then(() => {
        // After persistence is set, attempt to sign in
        return this.afAuth.signInWithEmailAndPassword(email, password);
    })).pipe(
        catchError((err) => {
          console.log("Error in sign in with email: ", err);
          this.handleErrorLogin(err.code);
          return EMPTY;
        }),
        tap((user) => {
          // Store the user information locally after successful login
          localStorage.setItem('firebaseUserData', JSON.stringify(user.user));

          // Listen for automatic token changes and refresh using onIdTokenChanged
          this.afAuth.onIdTokenChanged((currentUser) => {
            if (currentUser) {
              currentUser.getIdToken(true).then((token) => {
                // Optionally store the refreshed token
                localStorage.setItem('token', token);
              });
            }
          });
        })
    );
  }

  getUserDataFromLocalStorage(): IUserDate {
    const tempA = localStorage.getItem('userData');
    return JSON.parse(tempA)
  }

  // set setUserDetails(user: IUserDate) {
  //   this.userDetails = user;
  // }

  // get userData(): IUserDate {
  //   if (!this.userDetails) {
  //     this.userDetails = this.getUserDataFromLocalStorage();
  //   }
  //   //console.log(this.userDetails);
    
  //   return this.userDetails
  // }

  // get userRole(): string {
  //   return this.userData?.role;
  // }

  // get userFName(): string {
  //   return this.userData?.fName;
  // }

  // get userLName(): string {
  //   return this.userData?.lName;
  // }

  // get userBusinessName(): string {
  //   return this.userData?.businessName;
  // }

  // get userBusinessNumber(): string {
  //   //console.log(this.userData.businessNumber);
    
  //   return this.userData?.businessNumber;
  // }

  // get userBusinessType(): string {
  //   return this.userData?.businessType;
  // }

  // get isTwoBusinessOwner(): boolean {
  //   return this.userData?.isTwoBusinessOwner;
  // }

  // get spouseFName(): string {
  //   return this.userData?.spouseFName;
  // }

  // get spouseLName(): string {
  //   return this.userData?.spouseLName;
  // }

  // get spouseBusinessType(): string {
  //   return this.userData?.spouseBusinessType;
  // }


  // get spouseBusinessName(): string {
  //   return this.userData?.spouseBusinessName;
  // }

  // get spouseBusinessNumber(): string {
  //   return this.userData?.spouseBusinessNumber;
  // }

  // get spouseId(): string {
  //   return this.userData?.spouseId;
  // }

  // get userId(): string {
  //   return this.userData?.id;
  // }

  handleErrorLogin(err: string): void {
    if (err === "auth/wrong-password") {
      this.error$.next("password");
    }
    if (err === "auth/user-not-found" || err === "auth/invalid-email") {
      this.error$.next("user");
    }

  }

  signIn(user: UserCredential): any {
    const url = `${environment.apiUrl}auth/signin`
    
    return from(user.user.getIdToken(true))
      .pipe(
        catchError((err) => {
          console.log("err in get id token: ", err);
          return EMPTY;
        }),
        tap((token) => {
          localStorage.setItem('token', token);
        } ),
        switchMap((token) => this.http.post(url, { token: token })),
        catchError((err) => {
            this.error$.next("error");
          console.log("err in post request: ", err);
          return EMPTY;
        }),
      )

  }

  handleErrorSignup(err: string): void {
    switch (err) {
      case "auth/email-already-in-use":
        this.error$.next("user");
        break;
      case "auth/invalid-email":
        this.error$.next("email");
        break;
      case "auth/network-request-failed":
        this.error$.next("net");
        break;
      case "auth/user-disabled":
      case "auth/user-not-found":
        this.error$.next("disabled");
        break;
      case "auth/too-many-requests":
        this.error$.next("many");
        break;
    }
  }

  SignUp(formData: any): Observable<any> {
    let uid: string = "";
    this.genericService.getLoader().subscribe();
    return from(this.afAuth.createUserWithEmailAndPassword(formData.personal.email, formData.validation.password))
      .pipe(
        finalize(() => this.genericService.dismissLoader()),
        catchError((err) => {
          console.log("err in create user: ", err);
          this.handleErrorSignup(err.code);
          return EMPTY;
        }),
        tap((userCredentialData: UserCredential) => uid = userCredentialData.user.uid),
        switchMap((userCredentialData: UserCredential) => from(sendEmailVerification(userCredentialData.user))),
        catchError((err) => {
          this.handleErrorSignup(err.code);
          console.log("err in send email verify: ", err);
          return EMPTY;
        }),
        tap(() => this.isVerfyEmail$.next(true)),
        switchMap(() => {
          const url = `${environment.apiUrl}auth/signup`
          formData.personal.firebaseId = uid;          
          return this.http.post(url, formData);

        }),
        catchError((err) => {
          this.afAuth.currentUser.then((user) =>{
            user.delete();
          }).catch((err) =>{
            console.log("err:", err);
          })
          this.handleErrorSignup("auth/network-request-failed");
          return EMPTY;
        })
      )
  }

  SendVerificationMail(): Observable<any> {
    return from(this.afAuth.currentUser)
    .pipe(
        catchError((err) => {
          console.log("err in send email verify", err);
          return EMPTY;
        }),
        tap((res) => res.sendEmailVerification()),
      )
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

