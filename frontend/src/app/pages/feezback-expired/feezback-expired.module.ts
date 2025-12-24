import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { FeezbackExpiredPageRoutingModule } from './feezback-expired-routing.module';
import { FeezbackExpiredPage } from './feezback-expired.page';
import { ButtonComponent } from '../../components/button/button.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FeezbackExpiredPageRoutingModule,
    ButtonComponent,
  ],
  declarations: [FeezbackExpiredPage]
})
export class FeezbackExpiredPageModule {}

