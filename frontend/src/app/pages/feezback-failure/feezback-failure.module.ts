import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { FeezbackFailurePageRoutingModule } from './feezback-failure-routing.module';
import { FeezbackFailurePage } from './feezback-failure.page';
import { ButtonComponent } from '../../components/button/button.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    FeezbackFailurePageRoutingModule,
    ButtonComponent,
  ],
  declarations: [FeezbackFailurePage]
})
export class FeezbackFailurePageModule {}

