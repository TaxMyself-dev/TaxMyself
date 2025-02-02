import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DocCreatePageRoutingModule } from './doc_create-routing.module';

import { DocCreatePage } from './doc-create.page';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    DocCreatePageRoutingModule,
    ReactiveFormsModule,
    SharedModule
  ],
  declarations: [DocCreatePage]
})
export class DocCreatePageModule {}
