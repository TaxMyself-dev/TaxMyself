import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { ClientPanelPage } from './clients-panel.page';
import { SharedModule } from '../../shared/shared.module';
import { ClientPanelPageRoutingModule } from './clients-panel-routing.module';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ButtonComponent } from '../../components/button/button.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ClientPanelPageRoutingModule,
    SharedModule,
    ReactiveFormsModule,
    DialogModule,
    ToastModule,
    ButtonComponent,
  ],
  declarations: [ClientPanelPage],
  providers: [MessageService],
})
export class ClientPanelPageModule {}
