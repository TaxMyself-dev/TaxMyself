import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';

import { ReportReviewPageRoutingModule } from './report-review-routing.module';

import { ReportReviewPage } from './report-review.page';
import { ButtonComponent } from '../../components/button/button.component';
import { GenericTableComponent } from '../../components/generic-table/generic-table.component';
import { DateFormatPipe } from '../../pipes/date-format.pipe';
import { ReportReviewEditDialogComponent } from '../../components/report-review-edit-dialog/report-review-edit-dialog.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    ReportReviewPageRoutingModule,
    DialogModule,
    TooltipModule,
    ButtonComponent,
    GenericTableComponent,
    DateFormatPipe,
    ReportReviewEditDialogComponent,
  ],
  declarations: [ReportReviewPage]
})
export class ReportReviewPageModule {}
