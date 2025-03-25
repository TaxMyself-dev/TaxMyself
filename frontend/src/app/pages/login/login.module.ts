import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { LoginPageRoutingModule } from './login-routing.module';

import { LoginPage } from './login.page';
import { SharedModule } from '../../shared/shared.module';
import { ButtonComponent } from "../../components/button/button.component";

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    LoginPageRoutingModule,
    ReactiveFormsModule,
    SharedModule,
    ButtonComponent
],
  declarations: [LoginPage]
})
export class LoginPageModule {}
