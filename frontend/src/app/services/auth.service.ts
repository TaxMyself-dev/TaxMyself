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
  public isToastOpen$ = new BehaviorSubject<boolean>(false);


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

  signIn(user: UserCredential): any {
    console.log("in sign in");
    const url = 'http://localhost:3000/auth/signin'
    return from(user.user.getIdToken())
      .pipe(
        catchError((err) => {
          console.log("err in get id token: ", err);
          return EMPTY;
        }),
        tap((token) => localStorage.setItem('token', token)),
        switchMap((token) => this.http.post(url, { token: token })),
        catchError((err) => {
          // if (err.status == 0) {
            this.error$.next("error");
          // }
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
          this.afAuth.currentUser.then((user) =>{
            user.delete();
          }).catch((err) =>{
            console.log("err:", err);
          })
          this.handleErrorSignup("auth/network-request-failed");
          return EMPTY;
        })
      )
      .subscribe((res) => {
        console.log("res in sub signup", res);
        this.router.navigate(['login']);
      })
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
      // .subscribe((user) => {
      //   user.sendEmailVerification();
        
      // })
    // return this.afAuth.currentUser
    //   .then((u: any) => u.sendEmailVerification())
    //   .then(() => {
    //     //this.router.navigate(['verify-email-address']);
    //   });
  }

  ForgotPassword(passwordResetEmail: string): Observable<any> {
    return from(this.afAuth.sendPasswordResetEmail(passwordResetEmail));
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

