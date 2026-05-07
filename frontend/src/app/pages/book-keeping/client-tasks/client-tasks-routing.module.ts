import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ClientTasksPage } from './client-tasks.page';

const routes: Routes = [{ path: '', component: ClientTasksPage }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ClientTasksPageRoutingModule {}
