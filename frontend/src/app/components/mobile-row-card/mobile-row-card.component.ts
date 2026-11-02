import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { ICellRenderer } from 'src/app/shared/enums';
import {
  IColumnDataTable,
  IMobileCardConfig,
  IRowDataTable,
  ISelectItem,
  MobileHighlightedValueFormat,
} from 'src/app/shared/interface';
import { IGenericTableAction } from '../generic-table/table-actions';
import { TableRowActionsMenuComponent } from '../table-row-actions-menu/table-row-actions-menu.component';
import { DateFormatPipe } from 'src/app/pipes/date-format.pipe';

@Component({
  selector: 'app-mobile-row-card',
  templateUrl: './mobile-row-card.component.html',
  styleUrls: ['./mobile-row-card.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DateFormatPipe, TableRowActionsMenuComponent],
})
export class MobileRowCardComponent {

  // ─── Inputs ──────────────────────────────────────────────────────────────
  row        = input.required<IRowDataTable>();
  columns    = input.required<IColumnDataTable<any, any>[]>();
  config     = input.required<IMobileCardConfig>();
  actions    = input<IGenericTableAction[]>([]);
  searchTerm = input<string>('');
  /** Color highlighted `sum` by sign when row has `__sumNumeric` (My Account unclassified). */
  sumSignColors = input<boolean>(false);
  unassignedBillRed = input<boolean>(false);
  showCheckbox = input<boolean>(false);
  checked = input<boolean>(false);

  // ─── Outputs ─────────────────────────────────────────────────────────────
  actionClicked = output<{ action: IGenericTableAction; row: IRowDataTable }>();
  checkedChange = output<boolean>();

  // ─── Internal signals ────────────────────────────────────────────────────
  expanded = signal(false);

  // ─── Computed: hero column lookups ───────────────────────────────────────
  titleColumn = computed(() =>
    this.columns().find(c => (c.name as string) === this.config().primaryFields[0]) ?? null
  );

  dateColumn = computed(() =>
    this.columns().find(c => (c.name as string) === this.config().dateField) ?? null
  );

  highlightedColumn = computed(() =>
    this.columns().find(c => (c.name as string) === this.config().highlightedField) ?? null
  );

  sumExpenseHighlight = computed(() => {
    if (!this.sumSignColors()) return false;
    const hc = this.highlightedColumn();
    if (!hc || String(hc.name) !== 'sum') return false;
    const raw = this.row()['__sumNumeric'];
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) && n < 0;
  });

  sumIncomeHighlight = computed(() => {
    if (!this.sumSignColors()) return false;
    const hc = this.highlightedColumn();
    if (!hc || String(hc.name) !== 'sum') return false;
    const raw = this.row()['__sumNumeric'];
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) && n > 0;
  });

  formattedHighlightedValue = computed((): string => {
    const col = this.highlightedColumn();
    if (!col) return '';
    return this.formatMobileHighlightedValue(this.resolveValue(col));
  });

  private formatMobileHighlightedValue(value: unknown): string {
    if (value == null) return '';
    const str = String(value);
    if (str.trim() === '') return '';
    const format: MobileHighlightedValueFormat =
      this.config().highlightedValueFormat ?? 'currencyIls';
    switch (format) {
      case 'currencyIls': return `${str} ₪`;
      case 'percent':     return `${str}%`;
      case 'plain':       return str;
    }
  }

  // ─── Computed: excluded column names set ─────────────────────────────────
  private excludedNames = computed(() => new Set<string>([
    ...this.config().primaryFields,
    this.config().highlightedField,
    this.config().dateField,
    ...(this.config().hiddenFields ?? []),
  ]));

  // ─── Computed: body columns (all minus excluded) ─────────────────────────
  private bodyColumns = computed(() =>
    this.columns().filter(c => !this.excludedNames().has(c.name as string))
  );

  // ─── Computed: visible splits ────────────────────────────────────────────
  summaryColumns  = computed(() => this.bodyColumns().slice(0, 2));
  expandedColumns = computed(() => this.bodyColumns().slice(2));
  hasExpanded     = computed(() => this.expandedColumns().length > 0);

  // ─── Expose enums to template ────────────────────────────────────────────
  readonly CellRenderer  = ICellRenderer;
  readonly ButtonColor   = ButtonColor;
  readonly ButtonSize    = ButtonSize;

  // ─── Value resolution ────────────────────────────────────────────────────
  resolveValue(col: IColumnDataTable<any, any>): string | number | boolean | Date | ISelectItem | File {
    return this.row()[col.name as string];
  }

  resolveListLabel(col: IColumnDataTable<any, any>): string {
    const raw = this.row()[col.name as string];
    const match = col.listItems?.find(item => item.value === raw);
    return match ? String(match.name) : String(raw ?? '');
  }

  // ─── Interaction handlers ────────────────────────────────────────────────
  toggleExpand(): void {
    this.expanded.update(v => !v);
  }

  onActionClick(action: IGenericTableAction): void {
    this.actionClicked.emit({ action, row: this.row() });
  }

  onCheckboxChange(event: Event): void {
    event.stopPropagation();
    this.checkedChange.emit((event.target as HTMLInputElement).checked);
  }

  billUnassigned(): boolean {
    const b = this.row()['billName'];
    return !b || String(b).trim() === '' || b === 'לא שוייך';
  }
}
