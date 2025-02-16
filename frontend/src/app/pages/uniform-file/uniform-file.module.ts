import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { UniformFilePageRoutingModule } from './uniform-file-routing.module';
import { UniformFilePage } from './uniform-file.page';
import { SharedModule } from '../../shared/shared.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    UniformFilePageRoutingModule,
    ReactiveFormsModule,
    SharedModule
  ],
  declarations: [UniformFilePage]
})
export class UnifromFilePageModule {}
