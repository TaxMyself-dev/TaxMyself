import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';
import { TransactionsPage } from './transactions.page';
import { TransactionsPageRoutingModule } from './transactions-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { TopNavComponent } from "../../components/topNav/topNav.component";
import { ImageBunnerComponent } from "../../components/image-bunner/image-bunner.component";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    SharedModule,
    TransactionsPageRoutingModule,
    TopNavComponent,
    ImageBunnerComponent
],
  declarations: [TransactionsPage]
})
export class TransactionsPageModule {}
