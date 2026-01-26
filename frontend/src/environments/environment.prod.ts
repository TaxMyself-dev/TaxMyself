export const environment = {
  production: true,
  apiUrl: 'https://taxmys16elf-prod-tau7bgxb3q-zf.a.run.app/',
  firebase: {
    apiKey: "AIzaSyAd1L-ZpbvU_rLSEin0_MjvzZQYfNX51i0",
    authDomain: "taxmyself-prod.firebaseapp.com",
    projectId: "taxmyself-prod",
    storageBucket: "taxmyself-prod.appspot.com",
    messagingSenderId: "146140406969",
    appId: "1:146140406969:web:4b9777e99586bab08c6768",
    measurementId: "G-6FXDETL8H1"
  },
  // Test agent credentials for admin panel testing
  // Set these values from your .env file or leave empty to enter manually in the UI
  testAgent: {
    apiKey: '', // Set from .env or leave empty to use from backend
    secret: '', // Set from .env or leave empty to use from backend
  },
};
