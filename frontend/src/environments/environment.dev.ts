// DEV cloud build (`ng build --configuration dev`).
// Optimized/PWA build of the DEV stack: DEV Cloud Run backend + DEV Firebase
// project. `production: true` enables prod mode and the service worker — it
// does NOT mean production resources.
export const environment = {
  production: true,
  enableDevTools: true,
  apiUrl: 'https://taxmys16elf-dev-146140406969.me-west1.run.app/',
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
