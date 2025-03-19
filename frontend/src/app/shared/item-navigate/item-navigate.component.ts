import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { IColumnDataTable, IItemNavigate } from '../interface';
import { Router } from '@angular/router';
import { ModalExpensesComponent } from '../modal-add-expenses/modal.component';
import { ExpenseDataService } from 'src/app/services/expense-data.service';
import { ModalController } from '@ionic/angular';
import { ExpenseFormColumns, ExpenseFormHebrewColumns, NavigationItemClass } from '../enums';
import { Subject, takeUntil } from 'rxjs';

@Component({
    selector: 'app-item-navigate',
    templateUrl: './item-navigate.component.html',
    styleUrls: ['./item-navigate.component.scss'],
    standalone: false
})
export class ItemNavigateComponent  implements OnInit{

  @Input() navigationItems: IItemNavigate[];
  @Input() disableClick = false;
  @Input() navigationClass = NavigationItemClass.CIRCLE;
  @Input() navigationItemStyle: string;
  
  @Output() onNavButtonClicked = new EventEmitter<IItemNavigate>();
  columns: IColumnDataTable<ExpenseFormColumns, ExpenseFormHebrewColumns>[]; // Titles of expense// TODO: what? why is this here? should be generic??

  page: string;
  destroy$ = new Subject<void>();



  constructor(private expenseDataServise: ExpenseDataService, private router: Router, private modalCtrl: ModalController) { }


  ngOnInit() {
    console.log(this.navigationItems);
    
    this.columns = this.expenseDataServise.getAddExpenseColumns()
    this.page = this.router.url;
    console.log(this.page);
    
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onButtonClicked(selectedItem: IItemNavigate): void {
    console.log("onButtonClicked");
    
    if (selectedItem.link === "/add-expenses") {
      this.openModalAddExpense();
      return;
    }
    if (selectedItem.link != "" ){
      this.router.navigate([selectedItem.link])
    }
 
      this.navigationItems.forEach((item: IItemNavigate) => 
      item.selected = item.name === selectedItem.name
      )
    
    this.onNavButtonClicked.emit(selectedItem);
  }

  openModalAddExpense() {
    this.expenseDataServise.openModalAddExpense()
    .pipe(
      takeUntil(this.destroy$)
    )
    .subscribe();
  }
}
