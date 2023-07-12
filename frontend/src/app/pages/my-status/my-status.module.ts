import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MyStatusPageRoutingModule } from './my-status-routing.module';

import { MyStatusPage } from './my-status.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MyStatusPageRoutingModule
  ],
  declarations: [MyStatusPage]
})
export class MyStatusPageModule {}
