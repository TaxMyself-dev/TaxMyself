import { Injectable, NgZone } from '@angular/core';
import { User } from '../shared/interface';
import { authState } from 'rxfire/auth';
import {
  AngularFirestore,
  AngularFirestoreDocument,
} from '@angular/fire/compat/firestore';
import * as auth from 'firebase/auth';
import { AngularFireAuth } from '@angular/fire/compat/auth';
import { Router } from '@angular/router';
import { Observable, of, concatMap, catchError, from, switchMap, EMPTY, tap } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import axios from 'axios';
import { log } from 'console';
@Injectable({
  providedIn: 'root'
})
export class AuthService {
  userData: any; // Save logged in user data
  public token: string;
  public uid: string;

  constructor(
    public afs: AngularFirestore, // Inject Firestore service
    public afAuth: AngularFireAuth, // Inject Firebase auth service
    public router: Router,
    private http: HttpClient,
    public ngZone: NgZone // NgZone service to remove outside scope warning
  ) {
    /* Saving user data in localstorage when 
   logged in and setting up null when logged out */
    this.afAuth.authState.subscribe(async (user) => {
      if (user) {
        this.userData = user;
        
        try{
          const token = await this.userData.getIdToken();
          console.log("aaaa",token);
          
          localStorage.setItem('user', JSON.stringify(this.userData));
          localStorage.setItem('token', token);
          console.log("token from loc",localStorage.getItem('token'));
          //const parsedUserData = JSON.parse(localStorage.getItem('user')!);
        }
        catch(error) {
          console.error("Error getting token:", error);
          console.log("Error getting token:", error);
          
        }

      } else {
        localStorage.setItem('user', 'null');
        JSON.parse(localStorage.getItem('user')!);
      }
    });
  }
  srcObservable = of(1, 2, 3, 4)
//================================== signin by rxjs =========================================
//================================== signin by rxjs =========================================
// Sign in with email/password Observable
// signInWithEmailAndPassword(email: string, password: string) {
//   return from(this.afAuth
//     .signInWithEmailAndPassword(email, password))
//     .pipe(switchMap((result) => {
//       console.log("uid:", result.user.uid);

//         return from(result.user.getIdToken());
//       }),
//         catchError((err) => {
//           // Handle errors
//           window.alert(err.message);
//           return EMPTY;
//         })).pipe(tap((res) => {
//           console.log("55555 ", res);
//           this.sendTokenToServer(res);
//         }))
//       }
      //     }).pipe(concatMap(res => {
  //       return this.srcObservable;
  //   //     return new Observable((observer) => {
  //   //       observer.next('here'+res);
  //   //       // res.user.getIdToken().then((token) => {
  //   //       // this.token = token;
  //   //       // this.uid = res.user.uid;
  //   // })
  // }) 
  // sendTokenToServer(data: any) {
  //   const headers = { 'content-type': 'application/json' };
  //   const url = 'http://localhost:3000/auth/signin';
  //   axios.post(url, { data })
  //   .then((res) => {
  //     console.log(res);
  //       //TODO: navigate to home and check these func:1. this.SetUserData(result.user);
  //       //   2.this.afAuth.authState.subscribe((user) 
  //     })
  //     .catch((err) => {
  //       console.log(err);
  //     })
      // return this.http.post(url,{data: JSON.stringify(data)},{headers:headers})
      //   .pipe(
      //     catchError((error) => {
      //       // Handle errors
      //       console.log('Error:', error?.response?.data?.message);
      //       console.error('Error:', error);
    //       throw error;
    //     })
    //   );
  //}
  //   this.SetUserData(result.user);
  //   this.afAuth.authState.subscribe((user) => {
  //     if (user) {
  //       this.router.navigate(['dashboard']);
  //     }
  //   });
  //   return {token: this.token, uid: this.uid};
  // })
  // .catch((error) => {
  //   window.alert(error.message);
  // });
  //=================================================================================
  //=================================================================================
  
  
  // Sign in with email/password
  async SignIn(email: string, password: string) {
    return this.afAuth
      .signInWithEmailAndPassword(email, password)
      .then((result) => {
        result.user.getIdToken()
          .then((token) => {
            axios.post('http://localhost:3000/auth/signin', {token})
            .then((response)=>{
            })
            console.log("data:", token);
          })
          .catch((err) => {
            console.log(err);
          }),
          this.uid = result.user.uid;
        console.log("uid:", this.uid);

        this.SetUserData(result.user);
        this.afAuth.authState.subscribe((user) => {
          if (user) {
            this.router.navigate(['home']);
          }
        });
      })
      .catch((error) => {
        window.alert(error.message);
      });
  }

  //================================================sign-up===================================
  // Sign up with email/password
  async SignUp(formData: any) {
    console.log("signup");
    
    return this.afAuth
      .createUserWithEmailAndPassword(formData.email, formData.password)
      .then((result) => {
        console.log(result.user.uid);
        const uid = result.user.uid;
        axios.post("http://localhost:3000/auth/signup", { formData: formData, uid: uid })
          .then((response) => {
            console.log(response.data);
          })
        .catch((err)=>{
          console.log(err);
          
        })
        /* Call the SendVerificaitonMail() function when new user sign 
        up and returns promise */
        this.SendVerificationMail();
        this.SetUserData(result.user);
      })
      .catch((error) => {
        window.alert(error.message);
      });
  }
  // Send email verfificaiton when new user sign up
  async SendVerificationMail() {
    return this.afAuth.currentUser
      .then((u: any) => u.sendEmailVerification())
      .then(() => {
        this.router.navigate(['verify-email-address']);
      });
  }
  // Reset Forggot password
  async ForgotPassword(passwordResetEmail: string) {
    return this.afAuth
      .sendPasswordResetEmail(passwordResetEmail)
      .then(() => {
        window.alert('Password reset email sent, check your inbox.');
      })
      .catch((error) => {
        window.alert(error);
      });
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
    const userRef: AngularFirestoreDocument<any> = this.afs.doc(
      `users/${user.uid}`
    );
    const userData: User = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      emailVerified: user.emailVerified,
    };
    return userRef.set(userData, {
      merge: true,
    });
  }
  // Sign out
  async SignOut() {
    return this.afAuth.signOut().then(() => {
      localStorage.removeItem('user');
      this.router.navigate(['login']);
    });
  }



}

