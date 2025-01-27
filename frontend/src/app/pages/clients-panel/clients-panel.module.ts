import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

//import { AdminPanelPageRoutingModule } from './clients-panel-routing.module';

import {ClientPanelPage } from './clients-panel.page';
import { SharedModule } from '../../shared/shared.module';
import { ClientPanelPageRoutingModule } from './clients-panel-routing.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ClientPanelPageRoutingModule,
    SharedModule,
    ReactiveFormsModule
  ],
  declarations: [ClientPanelPage]
})
export class ClientPanelPageModule {}
