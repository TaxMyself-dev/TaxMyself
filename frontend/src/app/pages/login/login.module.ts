import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { LoginPageRoutingModule } from './login-routing.module';

import { LoginPage } from './login.page';
import { SharedModule } from '../../shared/shared.module';
import { ButtonComponent } from "../../components/button/button.component";
import { ImageBunnerComponent } from 'src/app/components/image-bunner/image-bunner.component';
import { IconField } from 'primeng/iconfield';
import { InputIcon } from 'primeng/inputicon';
import { InputTextComponent } from "../../components/input-text/input-text.component";
import { ButtonModule } from 'primeng/button';
import { PasswordModule } from 'primeng/password';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    LoginPageRoutingModule,
    ReactiveFormsModule,
    SharedModule,
    ButtonComponent,
    ImageBunnerComponent,
    ButtonModule,
    IconField,
    InputIcon,
    InputTextComponent,
    PasswordModule,
],
  declarations: [LoginPage]
})
export class LoginPageModule {}
