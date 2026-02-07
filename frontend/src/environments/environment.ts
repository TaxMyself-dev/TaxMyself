// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000/',
  firebase: {
    apiKey: "AIzaSyClSnN3fRAb9aQVt2kMEkLygsNExwQD7fo",
    authDomain: "taxmyself-5d8a0.firebaseapp.com",
    projectId: "taxmyself-5d8a0",
    storageBucket: "taxmyself-5d8a0.appspot.com",
    messagingSenderId: "747885191189",
    appId: "1:747885191189:web:b230991e3a783614812e1c",
    measurementId: "G-K8B1TC0DKB"
  },
  // Test agent credentials for admin panel testing
  // Set these values from your .env file or leave empty to enter manually in the UI
  testAgent: {
    apiKey: '', // Set from .env or leave empty to use from backend
    secret: '', // Set from .env or leave empty to use from backend
  },
};