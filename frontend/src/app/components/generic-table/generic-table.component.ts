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
import { IColumnDataTable, IMobileCardConfig, IRowDataTable } from 'src/app/shared/interface';
import { IGenericTableAction, hasStoredTableFile, resolveTableActions } from './table-actions';
import { TableRowActionsMenuComponent } from '../table-row-actions-menu/table-row-actions-menu.component';
import { FormTypes, ICellRenderer } from 'src/app/shared/enums';
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
  imports: [CommonModule, InputIcon, IconField, InputGroupModule, InputGroupAddonModule, InputTextModule, ButtonComponent, TableModule, TooltipModule, TruncatePointerDirective, HighlightPipe, ButtonModule, ButtonGroupModule, DateFormatPipe, MobileRowCardComponent, TableRowActionsMenuComponent],
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
  actions = input<IGenericTableAction[]>([]);
  /** Opt-in legacy attach fallback; ordinary row actions never create an upload control. */
  fileAttachmentEnabled = input<boolean>(false);
  immediateActions = input<boolean>(true);
  filesAttached = input<Map<number, File>>(new Map());
  immediateFileOperation = input<boolean>(false);
  /** Allows callers to keep preview/download actions while suppressing file mutations. */
  fileEditingEnabled = input<boolean>(true);
  arrayFilters = input<any>();
  isLoadingState = input<boolean>(false);
  useSyncState = input<boolean>(false);
  processStatus = input<'running' | 'completed' | 'failed' | null>(null);
  incomeMode = input<boolean>(false);
  showCheckbox = input<boolean>(false);
  defaultSelectedValue = input<boolean>(false);
  columnSearch = input<string>('name');
  /** Optional row fields for free-text search. Without this input, the
   * existing single-column search behavior is preserved. */
  searchColumns = input<string[]>([]);
  tableHeight = input<string>('500px');
  selectionModeCheckBox = input<null | 'single' | 'multiple'>(null);
  placeholderSearch = input<string>();
  dataTable = input<IRowDataTable[]>([]);
  columnsTitle = input<IColumnDataTable<TFormColumns, TFormHebrewColumns>[]>([]);
  mobileCardConfig = input<IMobileCardConfig>();
  /** When true, negative `sum` (expenses) renders red and positive (income) green; expects `__sumNumeric` on rows. */
  sumSignColors = input<boolean>(false);
  /** When true, unlinked account column shows fixed "לא משוייך" in red (My Account unclassified). */
  unassignedBillRed = input<boolean>(false);
  /** Optional per-row CSS class callback. Return a class name string for the row; return '' or null for no extra class. */
  rowClass = input<((row: IRowDataTable) => string) | null>(null);
  /** When true, the hover row-actions strip renders each action's icon
   *  alongside its (always-visible) label (default: label-only, unchanged
   *  for every other consumer of labelled `actions`). Opt-in per page — see
   *  report-review. */
  showRowActionIcons = input<boolean>(false);

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

  /** Desktop table columns: same as columnsTitle but with hide:true entries removed. */
  visibleColumns = computed(() => this.columnsTitle().filter(col => !col.hide));
  isHovering = signal<number>(null);
  selectedTrans: IRowDataTable[] = [];

  // ─── Mobile checkbox selection (parallel to selectedTrans for desktop) ────
  mobileSelectedRows = signal<IRowDataTable[]>([]);

  mobileAllChecked = computed(() => {
    const total = this.dataTable().length;
    return total > 0 && this.mobileSelectedRows().length === total;
  });

  isMobileRowChecked(row: IRowDataTable): boolean {
    return this.mobileSelectedRows().some(r => r['id'] === row['id']);
  }

  onMobileRowChecked(row: IRowDataTable, checked: boolean): void {
    this.mobileSelectedRows.update(rows =>
      checked
        ? rows.some(r => r['id'] === row['id']) ? rows : [...rows, row]
        : rows.filter(r => r['id'] !== row['id'])
    );
    this.isAllChecked.emit(this.mobileAllChecked());
    this.rowsChecked.emit(this.mobileSelectedRows());
  }

  onMobileSelectAll(checked: boolean): void {
    const rows = checked ? [...this.dataTable()] : [];
    this.mobileSelectedRows.set(rows);
    this.isAllChecked.emit(checked && rows.length > 0);
    this.rowsChecked.emit(rows);
  }




  readonly buttonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;
  /** Exposed for template: `col.type === FormTypes.DATE` alongside name-based date detection */
  readonly FormTypes = FormTypes;
  /** Exposed for template: enables `col.cellRenderer === ICellRenderer.X` checks. */
  readonly ICellRenderer = ICellRenderer;

  /**
   * Picks the matching percent-field name for an AMOUNT_WITH_PERCENT cell.
   * Convention: `totalVatPayable` → `vatPercent`, `totalTaxPayable` → `taxPercent`.
   * Returns null when the column isn't one of those — caller falls back to plain text.
   */
  amountPercentField(colName: unknown): 'vatPercent' | 'taxPercent' | null {
    if (colName === 'totalVatPayable') return 'vatPercent';
    if (colName === 'totalTaxPayable') return 'taxPercent';
    return null;
  }

  /**
   * Display symbol for a currency code. Used by the SUM_WITH_FX renderer to
   * suffix the original amount (e.g. "100 $"). Falls back to the raw code
   * for currencies outside the supported set so the user still sees what
   * was synced even if we don't have a glyph for it.
   */
  currencySymbol(code: string | null | undefined): string {
    switch ((code ?? '').toUpperCase()) {
      case 'USD': return '$';
      case 'EUR': return '€';
      case 'GBP': return '£';
      case 'ILS': return '₪';
      default:    return code ?? '';
    }
  }

  /**
   * Absolute value of `ilsAmount` for the SUM_WITH_FX renderer. The original
   * amount (`row.sum`) is already displayed via `Math.abs` upstream and the
   * sign is conveyed via row color, so the ILS parenthesis should match —
   * showing the minus would be redundant.
   */
  absIls(value: number | string | null | undefined): number {
    const n = value == null ? 0 : Number(value);
    return isFinite(n) ? Math.abs(n) : 0;
  }


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
    if (!term) return data;

    const configuredColumns = this.searchColumns();
    const columns = configuredColumns.length > 0
      ? configuredColumns
      : [this.columnSearch()];

    return data?.filter(row => columns.some(column =>
      this.toSearchableText(row[column]).includes(term)
    ));
  });

  private toSearchableText(value: unknown): string {
    if (value == null) return '';

    const raw = String(value);
    const withoutHtml = raw.replace(/<[^>]*>/g, ' ');
    const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
    const displayedDate = isoDate
      ? `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`
      : '';

    return `${withoutHtml} ${displayedDate}`.toLowerCase();
  }

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

  /** A single row-aware list supplies desktop buttons and both mobile layouts. */
  getActionsForRow(row: IRowDataTable): IGenericTableAction[] {
    return resolveTableActions(this.actions(), row, {
      fileEditingEnabled: this.fileEditingEnabled(),
      fileAttachmentEnabled: this.fileAttachmentEnabled(),
      filesAttached: this.filesAttached(),
    }, target => this.triggerFileInput(target));
  }

  needsFileInput = computed(() => this.fileEditingEnabled()
    && (this.fileAttachmentEnabled() || this.actions().some(a => a.execution === 'fileInput')));

  private pendingFileRow: IRowDataTable | null = null;
  private fileSelectionMode: 'attachment' | 'action' | null = null;

  constructor() {
    effect(() => {
      const filters = this.arrayFilters();
      console.log('printFilters', filters);
    })
  }

  ngOnInit() {
    if (this.defaultSelectedValue()) {
      const allRows = [...this.dataTable()];
      this.selectedTrans = allRows;
      this.mobileSelectedRows.set(allRows);
      this.rowsChecked.emit(allRows);
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

  onCardActionClicked(event: { action: IGenericTableAction; row: IRowDataTable }): void {
    this.executeAction(event.action, event.row);
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const row = this.pendingFileRow;
    const mode = this.fileSelectionMode;
    this.pendingFileRow = null;
    this.fileSelectionMode = null;
    // Replacement callbacks own their change subscription. Do not clear the
    // input before they read it or emit a second upload through fileChange.
    if (mode !== 'attachment') return;
    const file = input.files?.[0];
    if (row && file) this.fileChange.emit({ row, file });
    input.value = '';
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

  executeAction(action: IGenericTableAction, row: IRowDataTable): void {
    const current = this.getActionsForRow(row).find(candidate => candidate.name === action.name);
    if (!current || current.isLoading?.()) return;
    if (current.execution === 'fileInput') {
      const input = this.fileInput?.nativeElement;
      if (!input || !this.fileEditingEnabled()) return;
      input.value = '';
      this.pendingFileRow = row;
      this.fileSelectionMode = 'action';
      current.action(input, row);
    } else {
      current.action(null, row);
    }
  }

  onFileSelectionCanceled(): void {
    this.pendingFileRow = null;
    this.fileSelectionMode = null;
  }

  triggerFileInput(row: IRowDataTable): void {
    const input = this.fileInput?.nativeElement;
    if (!input || !row || !this.fileEditingEnabled()) return;
    input.value = '';
    this.pendingFileRow = row;
    this.fileSelectionMode = 'attachment';
    input.click();
  }

  showAttachButton(row: IRowDataTable): boolean {
    // Show attach only when neither the legacy Firebase path nor a Drive
    // source-document link exists.
    return !this.hasStoredFile(row);
  }

  hasStoredFile(row?: IRowDataTable): boolean {
    return hasStoredTableFile(row);
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

}
