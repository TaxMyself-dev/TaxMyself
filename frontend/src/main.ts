import { enableProdMode } from '@angular/core';
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';

import { AppModule } from './app/app.module';
import { initializeFirebaseAuthPersistence } from './app/shared/auth/firebase-auth-persistence';
import { environment } from './environments/environment';

if (environment.production) {
  enableProdMode();
}

// Steps 1 + 2 of startup: detect installed PWA vs. regular browser, then create
// the Firebase Auth instance with the matching persistence. This has to happen
// before bootstrap — the first service that touches AngularFireAuth would
// otherwise create Auth with the SDK default (a permanent login shared with the
// installed app). Synchronous; restoring the stored session is what the app
// waits for afterwards via StartupService.
initializeFirebaseAuthPersistence();

platformBrowserDynamic().bootstrapModule(AppModule)
  .catch(err => console.log(err));
