import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { MyAccountPageRoutingModule } from './my-account-routing.module';

import { MyAccountPage } from './my-account.page';
import { SharedModule } from '../../shared/shared.module';
import { CardNavigateComponent } from 'src/app/components/card-navigate/card-navigate.component';
import { AvatarModule } from 'primeng/avatar';
import { AvatarGroupModule } from 'primeng/avatargroup';
import { ButtonComponent } from "../../components/button/button.component";
import { GenericTableComponent } from "../../components/generic-table/generic-table.component";
import { DashboardNavigateComponent } from 'src/app/components/dashboard-navigate/dashboard-navigate.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    MyAccountPageRoutingModule,
    SharedModule,
    CardNavigateComponent,
    DashboardNavigateComponent,
    AvatarModule,
    AvatarGroupModule,
    ButtonComponent,
    GenericTableComponent
],
  declarations: [MyAccountPage]
})
export class MyAccountPageModule {}
