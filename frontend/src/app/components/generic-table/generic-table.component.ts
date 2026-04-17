import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, HostListener, inject, input, OnInit, output, signal, ViewChild, WritableSignal } from '@angular/core';
import { MobileRowCardComponent } from 'src/app/components/mobile-row-card/mobile-row-card.component';
import { ButtonModule } from 'primeng/button';
import { ButtonGroupModule } from 'primeng/buttongroup';
import { InputIcon } from 'primeng/inputicon';
import { IconField } from 'primeng/iconfield';
import { TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { GenericService } from 'src/app/services/generic.service';
import { IColumnDataTable, IMobileCardConfig, IRowDataTable, ITableRowAction } from 'src/app/shared/interface';
import { FormTypes } from 'src/app/shared/enums';
import { DateFormatPipe } from 'src/app/pipes/date-format.pipe';
import { TruncatePointerDirective } from '../../directives/truncate-pointer.directive';
import { HighlightPipe } from "../../pipes/high-light.pipe";
import { animate, state, style, transition, trigger } from '@angular/animations';


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
    trigger('slideToggle', [
      state('expanded', style({ height: '*', opacity: 1, overflow: 'hidden' })),
      state('collapsed', style({ height: '0px', opacity: 0, overflow: 'hidden' })),
      transition('expanded => collapsed', animate('300ms ease-in-out')),
      transition('collapsed => expanded', animate('300ms ease-in-out')),
    ]),
  ],
  templateUrl: './generic-table.component.html',
  styleUrls: ['./generic-table.component.scss'],
  imports: [CommonModule, InputIcon, IconField, InputGroupModule, InputGroupAddonModule, InputTextModule, ButtonComponent, TableModule, TooltipModule, TruncatePointerDirective, HighlightPipe, ButtonModule, ButtonGroupModule, DateFormatPipe, MobileRowCardComponent],
  providers: [],
  changeDetection: ChangeDetectionStrategy.OnPush,

})
export class GenericTableComponent<TFormColumns, TFormHebrewColumns> implements OnInit {


  @ViewChild('filterPanelRef') filterPanelRef!: ElementRef;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const clickedInside = this.filterPanelRef?.nativeElement.contains(event.target);
    const clickedFilterButton = (event.target as HTMLElement).closest('.sort-button');

    if (!clickedInside && !clickedFilterButton && this.visibleFilterPannel()) {
      this.visibleFilterPannel.set(false); // 👈 close the panel
    }
  }

  genericService = inject(GenericService);
  title = input<string>();
  fileActions = input<ITableRowAction[]>([]);
  rowActions = input<ITableRowAction[]>([]);
  immediateActions = input<boolean>(true);
  filesAttached = input<Map<number, File>>(new Map());
  immediateFileOperation = input<boolean>(false);
  arrayFilters = input<any>();
  isLoadingState = input<boolean>(false);
  useSyncState = input<boolean>(false);
  processStatus = input<'running' | 'completed' | 'failed' | null>(null);
  incomeMode = input<boolean>(false);
  showCheckbox = input<boolean>(false);
  defaultSelectedValue = input<boolean>(false);
  columnSearch = input<string>('name');
  tableHeight = input<string>('500px');
  selectionModeCheckBox = input<null | 'single' | 'multiple'>(null);
  placeholderSearch = input<string>();
  dataTable = input<IRowDataTable[]>([]);
  columnsTitle = input<IColumnDataTable<TFormColumns, TFormHebrewColumns>[]>([]);
  mobileCardConfig = input<IMobileCardConfig>();
  mobileCardActions = input<ITableRowAction[]>();
  /** When true, negative `sum` (expenses) renders red and positive (income) green; expects `__sumNumeric` on rows. */
  sumSignColors = input<boolean>(false);
  /** When true, unlinked account column shows fixed "לא משוייך" in red (My Account unclassified). */
  unassignedBillRed = input<boolean>(false);

  rowBillUnassigned(row: IRowDataTable): boolean {
    const b = row?.['billName'];
    return !b || String(b).trim() === '' || b === 'לא שוייך';
  }
  isAllChecked = output<boolean>();
  resetFilters = output<string>();
  rowsChecked = output<IRowDataTable[]>();
  syncTriggered = output<void>();
  visibleFilterPannel = signal(false);
  visibleAccountAssociationDialog = signal(false);
  searchTerm = signal<string>('');
  isHovering = signal<number>(null);
  selectedTrans: IRowDataTable[] = [];




  readonly buttonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;
  /** Exposed for template: `col.type === FormTypes.DATE` alongside name-based date detection */
  readonly FormTypes = FormTypes;


  expandedRows = new Set<number>();
  hoverTimeout: any;
  hoveredRowInfo = signal<{ row: any, top: number } | null>(null);
  isRowHovered = signal<boolean>(false);
  isFloatingHovered = signal<boolean>(false);
  isSlideIn = signal<boolean>(false);

  fileChange = output<{ row: IRowDataTable, file?: File }>(); 

  effectiveIsLoading = computed(() =>
    this.isLoadingState() || (this.useSyncState() && this.processStatus() === 'running')
  );

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

  isMobile = computed(() => this.genericService.isMobile());

  // ─── Mobile filter summary ────────────────────────────────────────────────
  filterSummaryExpanded = signal(false);

  // ─── Mobile table section collapse/expand ────────────────────────────────
  mobileTableExpanded = signal(true);

  mobileTimeLabel = computed((): string => {
    const f = this.arrayFilters();
    if (!f?.periodType) return '';
    const labels: Record<string, string> = {
      MONTHLY:    'חודשי',
      BIMONTHLY:  'דו חודשי',
      ANNUAL:     'שנתי',
      DATE_RANGE: 'טווח תאריכים',
    };
    return labels[f.periodType] ?? '';
  });

  mobileAccountLabel = computed((): string => {
    const count = this.arrayFilters()?.account?.length ?? 0;
    return count === 0 ? 'הכל' : `${count}`;
  });

  mobileCategoryLabel = computed((): string => {
    const count = this.arrayFilters()?.category?.length ?? 0;
    return count === 0 ? 'הכל' : `${count}`;
  });

  // null = field not present / no sources selected → hidden from summary
  mobileSourcesLabel = computed((): string | null => {
    const count = this.arrayFilters()?.sources?.length ?? 0;
    return count === 0 ? null : `${count}`;
  });

  toggleFilterSummary(): void {
    this.filterSummaryExpanded.update(v => !v);
  }

  toggleMobileSection(): void {
    this.mobileTableExpanded.update(v => !v);
  }

  /** Returns rowActions filtered by showWhen for the given row. */
  getRowActions(row: IRowDataTable): ITableRowAction[] {
    if (!row) return [];
    return this.rowActions().filter(a => !a.showWhen || a.showWhen(row));
  }

  /** Actions passed to a mobile card: mobileCardActions override takes priority,
   *  otherwise use the row-filtered rowActions. */
  mobileActionsForRow(row: IRowDataTable): ITableRowAction[] {
    const override = this.mobileCardActions();
    if (override?.length) return override;
    return this.getRowActions(row);
  }



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

  triggerFullSync(): void {
    // Delegate: emit to parent, who owns the sync trigger and polling lifecycle.
    this.syncTriggered.emit();
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

  onCardActionClicked(event: { action: ITableRowAction; row: IRowDataTable }): void {
    event.action.action(undefined, event.row);
  }

  // applyFilters(filters: FormGroup): void {
  //   console.log('applyFilters', filters);
  //   this.visibleFilterPannel.set(false);
  //   this.filters.emit(filters);
  // }

  onFileChange(event: Event, row?: IRowDataTable) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    if (!file) {
      return;
    }

    // Use provided row or get from hoveredRowInfo
    const targetRow = row || this.hoveredRowInfo()?.row;
    if (!targetRow) {
      return;
    }

    this.fileChange.emit({ row: targetRow, file });
    input.value = "";
  }

  getFileName(row?: IRowDataTable): string {
    if (!row) return 'קובץ מצורף';

    // First check if there's a newly attached file in the map
    const attachedFile = this.filesAttached().get(row.id as number);
    if (attachedFile) {
      return attachedFile.name;
    }
    // Otherwise, return the fileName from the row data (existing file)
    return row['fileName'] as string || 'קובץ מצורף';
  }

  executeAction(action: ITableRowAction, row: IRowDataTable, fileInput?: HTMLInputElement): void {
    if (action.action) {
      // Use provided fileInput or fallback to ViewChild reference
      const inputElement = fileInput || this.fileInput?.nativeElement;
      // For actions that need file input (like edit)
      if (action.name === 'edit' && inputElement) {
        action.action(inputElement, row);
      } else {
        action.action(null, row);
      }
    }
  }

  triggerFileInput(): void {
    if (this.fileInput?.nativeElement) {
      this.fileInput.nativeElement.click();
    }
  }

  showAttachButton(row: IRowDataTable): boolean {
    // Show attach button if there's no server file (only for new attachments)
    return !(row['file'] && row['file'] !== '' && row['file'] !== null);
  }

  hasFileAttached(row?: IRowDataTable): boolean {
    if (!row) return false;

    const hasInMap = this.filesAttached().has(row.id as number);
    const hasCount = row['attachmentCount'] && Number(row['attachmentCount']) > 0;
    const result = hasInMap || hasCount;
    // console.log(`hasFileAttached for row ${row.id}:`, { hasInMap, hasCount, result, mapSize: this.filesAttached().size });
    return result;
  }

  getCurrentRow(): IRowDataTable | undefined {
    return this.hoveredRowInfo()?.row;
  }

  hasAlwaysShowAction(): boolean {
    return this.fileActions().some(action => action.alwaysShow);
  }

  shouldShowAction(action: ITableRowAction): boolean {
    if (!action.alwaysShow) return false;
    if (action.name === 'close') {
      const row = this.hoveredRowInfo()?.row;
      if (row && row['docStatus']?.toUpperCase() === 'CLOSE') {
        return false;
      }
    }
    return true;
  }

  shouldShowFileAction(action: ITableRowAction): boolean {
    if (action.alwaysShow) return false;
    if (action.name === 'close') {
      const row = this.hoveredRowInfo()?.row;
      if (row && row['docStatus']?.toUpperCase() === 'CLOSE') {
        return false;
      }
    }
    return true;
  }

}
