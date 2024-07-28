import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RegisterPageRoutingModule } from './register-routing.module';
import { RegisterPage } from './register.page';
import { SharedModule } from "../../shared/shared.module";
import { IonicSelectableComponent } from 'ionic-selectable';

@NgModule({
    declarations: [RegisterPage],
    imports: [
        CommonModule,
        FormsModule,
        ReactiveFormsModule,
        IonicModule,
        RegisterPageRoutingModule,
        SharedModule,
        IonicSelectableComponent
    ]
})
export class RegisterPageModule {}
