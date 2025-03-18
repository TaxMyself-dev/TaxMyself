import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { RegisterPageModule } from './pages/register/register.module';
import { TableComponent } from './shared/table/table.component';
import { ModalExpensesComponent } from './shared/modal-add-expenses/modal.component';
import { ReactiveFormsModule } from '@angular/forms';
import { initializeApp} from '@angular/fire/app';
import { environment } from '../environments/environment';
import { getAuth } from '@angular/fire/auth';
// Firebase services + environment module
import { AngularFireModule } from '@angular/fire/compat';
import { AngularFireAuthModule } from '@angular/fire/compat/auth';
import { AngularFireStorageModule } from '@angular/fire/compat/storage';
import { AngularFirestoreModule } from '@angular/fire/compat/firestore';
import { AngularFireDatabaseModule } from '@angular/fire/compat/database';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from  '@angular/common/http';
import { NgArrayPipesModule } from 'ngx-pipes';
import { SharedModule } from './shared/shared.module';
import { AuthInterceptor } from './interceptors/auth.interceptor';


    
@NgModule({ declarations: [AppComponent],
    bootstrap: [AppComponent], imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule, ReactiveFormsModule,
        //provideFirebaseApp(() => initializeApp(environment.firebase)), provideAuth(() => getAuth()),
        AngularFireModule.initializeApp(environment.firebase),
        AngularFireAuthModule,
        AngularFirestoreModule,
        AngularFireStorageModule,
        AngularFireDatabaseModule,
        NgArrayPipesModule,
        SharedModule], providers: [
        { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
        provideHttpClient(withInterceptorsFromDi())
    ] })

export class AppModule {}
