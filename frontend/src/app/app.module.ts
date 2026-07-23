import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { ReactiveFormsModule } from '@angular/forms';
import { environment } from '../environments/environment';
import { AngularFireModule } from '@angular/fire/compat';
import { AngularFireAuthModule } from '@angular/fire/compat/auth';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';
import { AngularFireStorageModule } from '@angular/fire/compat/storage';
import { AngularFireDatabaseModule } from '@angular/fire/compat/database';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { NgArrayPipesModule } from 'ngx-pipes';
import { SharedModule } from './shared/shared.module';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { NgxEchartsModule } from 'ngx-echarts';
// PrimeNG
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeng/themes/aura';
import { TopNavComponent } from "./components/topNav/topNav.component";
import { ButtonComponent } from "./components/button/button.component";
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialog } from "primeng/confirmdialog";
import { ConfirmationService } from 'primeng/api';
import { ProgressSpinner } from 'primeng/progressspinner';
import { Dialog } from 'primeng/dialog';
import { AuthErrorInterceptor } from './interceptors/authError.interceptor';
import { UpgradeRequiredDialogComponent } from './components/upgrade-required-dialog/upgrade-required-dialog.component';
import { GmailImportSummaryDialogComponent } from './shared/gmail-import-summary/gmail-import-summary-dialog.component';
import { provideServiceWorker } from '@angular/service-worker';
import { PwaBannersComponent } from './components/pwa-banners/pwa-banners.component';


@NgModule({
  declarations: [AppComponent],
  bootstrap: [AppComponent],
  imports: [
    NgxEchartsModule.forRoot({
      echarts: () => import('echarts')
    }),
    BrowserModule,
    BrowserAnimationsModule,
    IonicModule.forRoot(), // Ensure IonicModule is initialized
    AppRoutingModule,
    ReactiveFormsModule,
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAuthModule,
    AngularFirestoreModule,
    AngularFireStorageModule,
    AngularFireDatabaseModule,
    NgArrayPipesModule,
    SharedModule,
    TopNavComponent,
    ButtonComponent,
    ToastModule,
    ConfirmDialog,
    ProgressSpinner,
    Dialog,
    UpgradeRequiredDialogComponent,
    GmailImportSummaryDialogComponent,
    PwaBannersComponent,
],
  providers: [
    providePrimeNG({theme: {preset: Aura}}),
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: AuthErrorInterceptor, multi: true },

    provideHttpClient(withInterceptorsFromDi()),
    MessageService,
    ConfirmationService,
    // PWA service worker — registered only in production, shortly after the app
    // stabilizes. A short 5s fallback ensures the worker registers and starts
    // prefetching the app shell early enough to survive an offline cold start;
    // the previous 30s fallback often left the shell uncached if the user closed
    // the app first. Caches only the versioned app shell + lazy chunks on demand
    // + static assets (see ngsw-config.json).
    provideServiceWorker('ngsw-worker.js', {
      enabled: environment.production,
      registrationStrategy: 'registerWhenStable:5000',
    }),
  ],
})
export class AppModule {}
