import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MyStoragePageRoutingModule } from './my-storage-routing.module';

import { MyStoragePage } from './my-storage.page';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ReactiveFormsModule,
    MyStoragePageRoutingModule,
    SharedModule
  ],
  declarations: [MyStoragePage]
})
export class MyStoragePageModule {}
