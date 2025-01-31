import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';

import { ClientPanelPage } from './clients-panel.page';

const routes: Routes = [
  {
    path: '',
    component: ClientPanelPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ClientPanelPageRoutingModule {}
