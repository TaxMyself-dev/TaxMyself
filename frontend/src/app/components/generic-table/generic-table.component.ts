import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, input, OnInit, output, signal, ViewChild, WritableSignal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ButtonGroupModule } from 'primeng/buttongroup';
import { InputIcon } from 'primeng/inputicon';
import { IconField } from 'primeng/iconfield';
import { TableModule } from 'primeng/table';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { IColumnDataTable, IRowDataTable } from 'src/app/shared/interface';
import { TruncatePointerDirective } from '../../directives/truncate-pointer.directive';
import { HighlightPipe } from "../../pipes/high-light.pipe";
import { animate, state, style, transition, trigger } from '@angular/animations';
import { AccountAssociationDialogComponent } from "../account-association-dialog/account-association-dialog.component";
import { FilterPanelComponent } from "../filter-panel/filter-panell.component";
import { FormGroup } from '@angular/forms';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { catchError, EMPTY, finalize } from 'rxjs';
import { MessageService } from 'primeng/api';
import { fi } from 'date-fns/locale';


@Component({
  selector: 'app-generic-table',
  standalone: true,
  animations: [
    trigger('slideInFromLeft', [
      state('void', style({ transform: 'translateX(-100%)', opacity: 0 })),
      state('visible', style({ transform: 'translateX(0)', opacity: 1 })),
      transition('void => visible', animate('400ms ease-out')),
      transition('visible => void', animate('200ms ease-in')),
    ]),
  ],
  templateUrl: './generic-table.component.html',
  styleUrls: ['./generic-table.component.scss'],
  imports: [CommonModule, InputIcon, IconField, InputGroupModule, InputGroupAddonModule, InputTextModule, ButtonComponent, TableModule, TruncatePointerDirective, HighlightPipe, ButtonModule, ButtonGroupModule, AccountAssociationDialogComponent, FilterPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,

})
export class GenericTableComponent<TFormColumns, TFormHebrewColumns> implements OnInit {

  
  @ViewChild('filterPanelRef') filterPanelRef!: ElementRef;
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const clickedInside = this.filterPanelRef?.nativeElement.contains(event.target);
    const clickedFilterButton = (event.target as HTMLElement).closest('.sort-button');
    
    if (!clickedInside && !clickedFilterButton && this.visibleFilterPannel()) {
      this.visibleFilterPannel.set(false); // 👈 close the panel
    }
  }
  
  messageService = inject(MessageService);
  transactionService = inject(TransactionsService);

  title = input<string>();
  isLoadingState = input<boolean>(false);
  incomeMode = input<boolean>(false);
  filterButtonDisplay = input<boolean>(false);
  showButtons = input<boolean>(false);
  showCheckbox = input<boolean>(false);
  defaultSelectedValue = input<boolean>(false);
  columnSearch = input<string>('name');
  tableHeight = input<string>('500px');
  selectionModeCheckBox = input<null | 'single' | 'multiple'>(null);
  placeholderSearch = input<string>();
  dataTable = input<IRowDataTable[]>([]);
  columnsTitle = input<IColumnDataTable<TFormColumns, TFormHebrewColumns>[]>([]);
  visibleAccountAssociationClicked = output<{ state: boolean, data: IRowDataTable }>();
  visibleClassifyTranClicked = output<{ state: boolean, data: IRowDataTable, incomeMode: boolean }>();
  filters = output<FormGroup>();
  isAllChecked = output<boolean>();
  rowsChecked = output<IRowDataTable[]>();
  visibleFilterPannel = signal(false);
  visibleAccountAssociationDialog = signal(false);
  searchTerm = signal<string>('');
  isHovering = signal<number>(null);
  selectedTrans: IRowDataTable[] = [];
  // isAllChecked = signal<boolean>(false);

  


  readonly buttonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;


  expandedRows = new Set<number>();
  hoverTimeout: any;
  hoveredRowInfo = signal<{ row: any, top: number } | null>(null);
  isRowHovered = signal<boolean>(false);
  isLoadingQuickClassify = signal<boolean>(false);
  isFloatingHovered = signal<boolean>(false);
  isSlideIn = signal<boolean>(false);

  onQuickClassifyClicked = output<boolean>();

  filteredDataTable = computed(() => {
    const data = this.dataTable();
    const term = this.searchTerm().toLowerCase().trim();
    const filtered = data?.filter(row => (String(row[this.columnSearch()]).includes(term)));
    console.log('filteredDataTable', filtered);
    return filtered;
  });

  constructor() { }

  ngOnInit() {
    if (this.defaultSelectedValue()) {
      this.selectedTrans = [...this.dataTable()];
      this.rowsChecked.emit(this.selectedTrans);
    }
  }
  
  onSelectionChange(event: any) {
    this.isAllChecked.emit(this.selectedTrans.length === this.dataTable().length);
    this.rowsChecked.emit(this.selectedTrans);
  }
  
  // onAllSelect($event: any) {
  //   console.log('onAllSelect');
  //   console.log('$event:', $event);
  //   // this.isAllChecked.emit($event.checked);
  //   console.log('Selected Rows:', this.selectedTrans);
    
  // }

  // get isHoveringAnywhere() {
  //   return this.isRowHovered() || this.isFloatingHovered();
  // }

  checkClearHover() {
    const notHovering = !this.isRowHovered() && !this.isFloatingHovered();
  
    if (notHovering) {
      this.isSlideIn.set(false); // hide with animation
      setTimeout(() => {
        // After animation, clear row
        if (!this.isRowHovered() && !this.isFloatingHovered()) {
          this.hoveredRowInfo.set(null);
        }
      }, 200); // match animation duration
    }
  }

onFloatingEnter() {
  clearTimeout(this.hoverTimeout);
  this.isFloatingHovered.set(true);
}

onFloatingLeave() {
  this.hoverTimeout = setTimeout(() => {
    this.isFloatingHovered.set(false);
    this.checkClearHover();
    this.hoveredRowInfo.set(null);
  }, 100); // small delay to avoid flicker
}

onRowLeave() {
  this.hoverTimeout = setTimeout(() => {
    this.isRowHovered.set(false);
    this.checkClearHover();
    this.hoveredRowInfo.set(null);
  }, 100);
}

onRowEnter(rowIndex: number, row: any, event: MouseEvent) {
  clearTimeout(this.hoverTimeout);
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  this.hoveredRowInfo.set({ row, top: rect.top + window.scrollY });
  this.isRowHovered.set(true);
  this.isSlideIn.set(false);
  setTimeout(() => {
    this.isSlideIn.set(true);
  }, 100); // small delay to avoid flicker
}

  isExpanded(rowData: any): boolean {
    return this.expandedRows.has(rowData.id);
  }

  toggleRow(rowData: any) {
    if (this.expandedRows.has(rowData.id)) {
      this.expandedRows.delete(rowData.id);
    } else {
      this.expandedRows.add(rowData.id);
    }
  }

  openFilterDialod(): void {
    this.visibleFilterPannel.set(!this.visibleFilterPannel());
  }

  updateSearchTerm(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchTerm.set(input.value);
  }

  // openAccountAssociation(): void {
  //   console.log('openAccountAssociation');
  //   this.visibleAccountAssociationDialog.set(true);
  // }

  close(): void {
    console.log('close');
    this.visibleAccountAssociationDialog.set(false);

  }

  onVisibleAccountAssociationClicked(row: IRowDataTable): void {
    console.log('row in onVisibleAccountAssociationClicked:', row);
    console.log('event in onVisibleAccountAssociationClicked:', true);

    console.log('onVisibleAccountAssociationClicked');
    this.visibleAccountAssociationClicked.emit({ state: true, data: row });
  }

  onVisibleClassifyTranClicked(row: IRowDataTable): void {
    this.visibleClassifyTranClicked.emit({ state: true, data: row, incomeMode: this.incomeMode() });
  }

  applyFilters(filters: FormGroup): void {
    console.log('applyFilters', filters);
    this.visibleFilterPannel.set(false);
    this.filters.emit(filters);
  }

  quickClassify(row: IRowDataTable): void {
    this.isLoadingQuickClassify.set(true);
    this.transactionService.quickClassify(row.id as number)
    .pipe(
      catchError((err) => {
        console.log("error in quick classify", err);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail:"סיווג ההוצאה נכשל אנא נסה/י שנית",
          sticky: true,
          life: 3000,
          key: 'br'
        })
        return EMPTY;
      }),
      finalize(() => {
        this.isLoadingQuickClassify.set(false);
      })
    )
    .subscribe(() => {
      this.onQuickClassifyClicked.emit(true);
      this.messageService.add({
        severity: 'success',
        summary: 'Success',
        detail:"סיווג מהיר הצליח",
        life: 3000,
        key: 'br'
      })
    });
  }

}
