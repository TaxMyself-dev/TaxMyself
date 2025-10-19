import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, input, OnInit, output, signal, ViewChild, WritableSignal } from '@angular/core';
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
import { DateFormatPipe } from 'src/app/pipes/date-format.pipe';
import { TruncatePointerDirective } from '../../directives/truncate-pointer.directive';
import { HighlightPipe } from "../../pipes/high-light.pipe";
import { animate, state, style, transition, trigger } from '@angular/animations';
import { AccountAssociationDialogComponent } from "../account-association-dialog/account-association-dialog.component";
import { FilterPanelComponent } from "../filter-panel/filter-panell.component";
import { FormGroup } from '@angular/forms';
import { TransactionsService } from 'src/app/pages/transactions/transactions.page.service';
import { catchError, EMPTY, finalize } from 'rxjs';
import { MessageService } from 'primeng/api';


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
  imports: [CommonModule, InputIcon, IconField, InputGroupModule, InputGroupAddonModule, InputTextModule, ButtonComponent, TableModule, TruncatePointerDirective, HighlightPipe, ButtonModule, ButtonGroupModule, DateFormatPipe],
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
  arrayFilters = input<any>();
  isLoadingState = input<boolean>(false);
  incomeMode = input<boolean>(false);
  // filterButtonDisplay = input<boolean>(false);
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
  // filters = output<FormGroup>();
  isAllChecked = output<boolean>();
  resetFilters = output<string>();
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
    const filtered = data?.filter(row => (String(row[this.columnSearch()]).toLowerCase().includes(term)));
    return filtered;
  });

  readonly iterableArrayFilter = computed(() => {
    const filter = this.arrayFilters();
    return filter ? [filter] : [];
  });

    

  constructor() { 
    effect(() => {
      const filters = this.arrayFilters();
      console.log('printFilters', filters);
    })
  }

  ngOnInit() {
    
    
    if (this.defaultSelectedValue()) {
      this.selectedTrans = [...this.dataTable()];
      this.rowsChecked.emit(this.selectedTrans);
    }
  }

  getFullPeriodDisplay(filter: {
    periodType: string;
    year?: number;
    month?: number;
    bimonth?: number;
    startDate?: string;
    endDate?: string;
  }): string {
    const periodLabels: Record<string, string> = {
      MONTHLY: "חודשי",
      BIMONTHLY: "דו חודשי",
      ANNUAL: "שנתי",
      DATE_RANGE: "טווח תאריכים",
    };
  
    const monthNames: Record<number, string> = {
      1: 'ינואר',
      2: 'פברואר',
      3: 'מרץ',
      4: 'אפריל',
      5: 'מאי',
      6: 'יוני',
      7: 'יולי',
      8: 'אוגוסט',
      9: 'ספטמבר',
      10: 'אוקטובר',
      11: 'נובמבר',
      12: 'דצמבר',
    };
  
    const bimonthNames: Record<number, string> = {
      1: 'ינואר-פברואר',
      2: 'מרץ-אפריל',
      3: 'מאי-יוני',
      4: 'יולי-אוגוסט',
      5: 'ספטמבר-אוקטובר',
      6: 'נובמבר-דצמבר',
    };
  
    const formatDate = (dateStr?: string): string => {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, '0');
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    };
  
    const type = filter.periodType;
    const label = periodLabels[type] || type;
  
    switch (type) {
      case 'MONTHLY':
        return `זמן: ${label} - ${monthNames[filter.month ?? 0] || ''}, ${filter.year ?? ''}`;
  
      case 'BIMONTHLY':
        return `זמן: ${label} - ${bimonthNames[filter.bimonth ?? 0] || ''}, ${filter.year ?? ''}`;
  
      case 'ANNUAL':
        return `זמן: ${label} - ${filter.year ?? ''}`;
  
      case 'DATE_RANGE':
        const from = formatDate(filter.startDate);
        const to = formatDate(filter.endDate);
        return `זמן: ${label} - מתאריך ${from} עד ${to}`;
  
      default:
        return '';
    }
  }
  
  formatNames(list: { name: string }[]): string {
    const maxVisible = 4;
  
    if (!list || list.length === 0) return '';
  
    const visible = list.slice(0, maxVisible).map(item => item.name);
    const remaining = list.length - maxVisible;
  
    let result = visible.join(', ');
    if (remaining > 0) {
      result += ` ועוד (${remaining})`;
    }
  
    return result;
  }
  
  redefineFilters(event: string) {
    console.log('redefineFilters', event);
    //this.arrayFilters.set(event);
    this.resetFilters.emit(event);
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

  // applyFilters(filters: FormGroup): void {
  //   console.log('applyFilters', filters);
  //   this.visibleFilterPannel.set(false);
  //   this.filters.emit(filters);
  // }

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
