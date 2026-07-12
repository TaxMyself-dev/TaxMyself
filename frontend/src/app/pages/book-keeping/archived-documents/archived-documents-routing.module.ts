import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { ArchivedDocumentsPage } from './archived-documents.page';

const routes: Routes = [
  {
    path: '',
    component: ArchivedDocumentsPage
  }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ArchivedDocumentsPageRoutingModule {}
