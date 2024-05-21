import { Component, OnInit } from '@angular/core';
import { TransactionsService } from './transactions.page.service';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-transactions',
  templateUrl: './transactions.page.html',
  styleUrls: ['./transactions.page.scss'],
})

export class TransactionsPage {

    data$: Observable<any>;

  constructor(private transactionsService: TransactionsService) {}

  getTransactions() {
    this.data$ = this.transactionsService.getTransactionsData();
}

}