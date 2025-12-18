import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { UniformFilePageRoutingModule } from './uniform-file-routing.module';
import { UniformFilePage } from './uniform-file.page';
import { SharedModule } from '../../shared/shared.module';
import { GenericTableComponent } from "src/app/components/generic-table/generic-table.component";
import { FilterTabComponent } from "src/app/components/filter-tab/filter-tab.component";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    UniformFilePageRoutingModule,
    ReactiveFormsModule,
    SharedModule,
    GenericTableComponent,
    FilterTabComponent
],
  declarations: [UniformFilePage]
})
export class UnifromFilePageModule {}
