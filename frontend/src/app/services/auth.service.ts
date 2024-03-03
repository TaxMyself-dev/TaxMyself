import { Injectable, NgZone } from '@angular/core';
import { User } from '../shared/interface';
import { authState } from 'rxfire/auth';
import { AngularFirestore, AngularFirestoreDocument } from '@angular/fire/compat/firestore';
import * as auth from 'firebase/auth';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import { Observable, of, concatMap, catchError, from, switchMap, EMPTY, tap, Subject, BehaviorSubject, map, filter } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import axios from 'axios';
import { UserCredential } from '@firebase/auth-types';

import {
  Auth,
  //UserCredential,
  createUserWithEmailAndPassword,
  sendEmailVerification,
} from '@angular/fire/auth';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  userData: any; // Save logged in user data
  public token: string;
  // public uid: string;

  constructor(
    public afs: AngularFirestore, // Inject Firestore service
    public afAuth: AngularFireAuth, // Inject Firebase auth service
    public router: Router,
    private http: HttpClient,
    public ngZone: NgZone, // NgZone service to remove outside scope warning
    // private readonly auth: Auth
  ) {


    /* Saving user data in localstorage when 
    logged in and setting up null when logged out */
  }

  public isLoggedIn$ = new BehaviorSubject<string>("");
  public error$ = new BehaviorSubject<string>("");

  public isVerfyEmail$ = new BehaviorSubject<boolean>(false);


  // Sign in with email/password

  userVerify(email: string, password: string): Observable<UserCredential> {
    console.log("in user verify");
    return from(this.afAuth.signInWithEmailAndPassword(email, password))
      .pipe(
        catchError((err) => {
          console.log("err in sign in with email: ", err);
          this.handleErrorLogin(err.code);
          
          return EMPTY;
        }),
        tap((user) => { localStorage.setItem('user', JSON.stringify(user.user)); })
      )
  }

  handleErrorLogin(err: string): void {
    console.log(err);
    if (err === "auth/wrong-password") {
      this.error$.next("password");
    }
    if (err === "auth/user-not-found" || err === "auth/invalid-email") {
      console.log("invalid");

      this.error$.next("user");
    }

  }

  //TODO: hsandle errors
  signIn(user: UserCredential): void {
    console.log("in sign in");
    const url = 'http://localhost:3000/auth/signin'
    from(user.user.getIdToken())
      .pipe(
        catchError((err) => {
          console.log("err in get id token: ", err);
          return EMPTY;
        }),
        tap((token) => localStorage.setItem('token', token)),
        switchMap((token) => this.http.post(url, { token: token })),
        catchError((err) => {
          console.log("err in post request: ", err);
          return EMPTY;
        }),
      )
      .subscribe(() => this.router.navigate(['home']))
  }

  // )



  //   return this.afAuth
  //     .signInWithEmailAndPassword(email, password)
  //     .then((result) => {
  //       console.log(result);
  //       result.user.getIdToken()
  //         .then((token) => {
  //           axios.post('http://localhost:3000/auth/signin', { token })
  //             .then((response) => {
  //             })
  //           //console.log("data:", token);
  //         })
  //         .catch((err) => {
  //           console.log(err);
  //         }),
  //         //this.uid = result.user.uid;
  //       // console.log("uid:", this.uid);

  //       this.SetUserData(result.user);
  //       //this.SaveDataUserInLocalStorage();
  //       //this.isLoggedIn$.next(localStorage.getItem('token'))
  //       this.afAuth.authState.subscribe((user) => {
  //         if (user.emailVerified) {
  //           this.router.navigate(['home']);
  //         }
  //         else{
  //           return user;
  //           alert("please verify email")
  //         }
  //       });
  //     })
  //     .catch((error) => {
  //       window.alert(error.message);
  //     });
  // }

  //================================================sign-up===================================
  // Sign up with email/password



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



  SignUp(formData: any): void {
    console.log("signup");
    console.log(formData);
    let uid: string = "";
    console.log(formData.personal.email, formData.validation.password);

    from(this.afAuth.createUserWithEmailAndPassword(formData.personal.email, formData.validation.password))
      .pipe(
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
          const url = 'http://localhost:3000/auth/signup'
          formData.personal.firebaseId = uid;
          return this.http.post(url, formData);

        }),
        catchError((err) => {
          console.log("err in http: ", err);
          return EMPTY;
        })
      )
      .subscribe((res) =>{
        console.log("res in sub signup", res);
        this.router.navigate(['login']);
      })
  }

  // Send email verfificaiton when new user sign up
  async SendVerificationMail() {
    return this.afAuth.currentUser
      .then((u: any) => u.sendEmailVerification())
      .then(() => {
        //this.router.navigate(['verify-email-address']);
      });
  }

  // sendVerificationMail(): Observable<void> {
  //   return from(this.afAuth.currentUser)
  //     .pipe(
  //       catchError((err) => {
  //         return EMPTY;
  //       }),
  //       switchMap(user => {
  //         if (user) {
  //           return from(user.sendEmailVerification());
  //         } else {
  //           return EMPTY;
  //         }
  //       })
  //     );
  // }

  // Reset Forggot password
  ForgotPassword(passwordResetEmail: string): void {
    from(this.afAuth
      .sendPasswordResetEmail(passwordResetEmail))
      .pipe(
        catchError((err) => {
          console.log("err in reset: ", err);
          switch (err.code) {
            case "auth/invalid-email":
            case "auth/user-not-found":
              // this.isErrLogIn$.next("user");
              this.error$.next("user");
              break;
            case "auth/too-many-requests":
            case "auth/network-request-failed":
            case "auth/operation-not-allowed":
              // this.isErrLogIn$.next("error")
              this.error$.next("error")
          }

          return EMPTY;
        })
      ).subscribe()
    // .then(() => {
    //   window.alert('Password reset email sent, check your inbox.');
    // })
    // .catch((error) => {
    //   window.alert(error);
    // });
  }

  // Returns true when user is looged in and email is verified
  get isLoggedIn(): boolean {
    const user = JSON.parse(localStorage.getItem('user')!);
    return user !== null && user.emailVerified !== false ? true : false;
  }
  // Sign in with Google
  async GoogleAuth() {
    return this.AuthLogin(new auth.GoogleAuthProvider()).then((res: any) => {
      this.router.navigate(['dashboard']);
    });
  }
  // Auth logic to run auth providers
  async AuthLogin(provider: any) {
    return this.afAuth
      .signInWithPopup(provider)
      .then((result) => {
        this.router.navigate(['dashboard']);
        this.SetUserData(result.user);
      })
      .catch((error) => {
        window.alert(error);
      });
  }
  /* Setting up user data when sign in with username/password, 
  sign up with username/password and sign in with social auth  
  provider in Firestore database using AngularFirestore + AngularFirestoreDocument service */
  SetUserData(user: any) {
    console.log("i am in set user data");

    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users/${user.uid}`
    );
    this.userData =
    {
      //TODO: add all the fields of user 
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
    };
    return userRef.set(this.userData, {
      merge: true,
    });
  }

  // Sign out
  async SignOut() {
    return this.afAuth.signOut().then(() => {
      localStorage.removeItem('user');
      localStorage.removeItem('token');
      this.router.navigate(['login']);
    });
  }



}

