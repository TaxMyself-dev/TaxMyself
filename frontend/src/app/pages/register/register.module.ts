import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RegisterPageRoutingModule } from './register-routing.module';
import { RegisterPage } from './register.page';
import { SharedModule } from "../../shared/shared.module";
import { IonicSelectableComponent } from 'ionic-selectable';
import { InputTextComponent } from "../../components/input-text/input-text.component";
import { InputSelectComponent } from "../../components/input-select/input-select.component";
import { ButtonComponent } from "../../components/button/button.component";
import { RadioButtonModule } from 'primeng/radiobutton';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { InputDateComponent } from 'src/app/components/input-date/input-date.component';
@NgModule({
    declarations: [RegisterPage],
    imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    IonicModule,
    RegisterPageRoutingModule,
    SharedModule,
    IonicSelectableComponent,
    InputTextComponent,
    InputDateComponent,
    InputSelectComponent,
    ButtonComponent,
    RadioButtonModule,
    ToggleSwitchModule,
]
})
export class RegisterPageModule {}
