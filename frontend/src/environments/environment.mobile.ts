
// Used only by the Angular mobile configuration (npm run mobile).
// Reach the development backend on the same computer serving the frontend.

export const environment = {
  production: false,
  enableDevTools: true,
  apiUrl: `http://${window.location.hostname}:3000/`,
  firebase: {
    apiKey: "AIzaSyClSnN3fRAb9aQVt2kMEkLygsNExwQD7fo",
    authDomain: "taxmyself-5d8a0.firebaseapp.com",
    projectId: "taxmyself-5d8a0",
    storageBucket: "taxmyself-5d8a0.appspot.com",
    messagingSenderId: "747885191189",
    appId: "1:747885191189:web:b230991e3a783614812e1c",
    measurementId: "G-K8B1TC0DKB"
  },
};
