import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { BookKeepingPage } from './book-keeping.page';
import { BookKeepingPageRoutingModule } from './book-keeping-routing.module';
import { SharedModule } from '../../shared/shared.module';
import { CardNavigateComponent } from "src/app/components/card-navigate/card-navigate.component";
import { TabsModule } from 'primeng/tabs';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    BookKeepingPageRoutingModule,
    SharedModule,
    CardNavigateComponent,
    TabsModule,
],
  declarations: [BookKeepingPage]
})
export class BookKeepingPageModule {}
