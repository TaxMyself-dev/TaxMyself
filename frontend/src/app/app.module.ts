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
import { ModalComponent } from './shared/modal/modal.component';
import { ReactiveFormsModule } from '@angular/forms';
import { TableService } from './services/table.service';

@NgModule({
  declarations: [AppComponent, SidebarNavComponent],
  imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule,RegisterPageModule,ReactiveFormsModule],
  providers: [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy },TableService],
  bootstrap: [AppComponent],
})
export class AppModule {}
