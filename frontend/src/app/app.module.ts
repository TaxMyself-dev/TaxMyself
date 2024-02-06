import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';
import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { SidebarNavComponent } from './core/sidebar-nav/sidebar-nav.component';
import { RegisterPageModule } from './pages/register/register.module';
import { TableComponent } from './shared/table/table.component';
import { ButtonComponent } from './shared/button/button.component';
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
import { HttpClientModule } from  '@angular/common/http';
import { NgArrayPipesModule } from 'ngx-pipes';


    
@NgModule({
  declarations: [AppComponent, SidebarNavComponent],
  imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule,RegisterPageModule,ReactiveFormsModule, 
    //provideFirebaseApp(() => initializeApp(environment.firebase)), provideAuth(() => getAuth()),
    AngularFireModule.initializeApp(environment.firebase),
    AngularFireAuthModule,
    AngularFirestoreModule,
    AngularFireStorageModule,
    AngularFireDatabaseModule,
    HttpClientModule,
    NgArrayPipesModule
  ],
  providers: [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }],
  bootstrap: [AppComponent],
})

export class AppModule {}
