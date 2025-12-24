import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { FeezbackSuccessPageRoutingModule } from './feezback-success-routing.module';
import { FeezbackSuccessPage } from './feezback-success.page';
import { ButtonComponent } from '../../components/button/button.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FeezbackSuccessPageRoutingModule,
    ButtonComponent,
  ],
  declarations: [FeezbackSuccessPage]
})
export class FeezbackSuccessPageModule {}

