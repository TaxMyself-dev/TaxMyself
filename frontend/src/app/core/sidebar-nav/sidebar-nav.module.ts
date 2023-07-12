import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { SidebarNavComponent } from './sidebar-nav.component';


@NgModule({
  declarations: [SidebarNavComponent],
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    IonicModule.forRoot()
  ],
  providers: [{ provide: RouteReuseStrategy, useClass: IonicRouteStrategy }],
  exports:[SidebarNavComponent]
})
export class SidebarNavModule {}
