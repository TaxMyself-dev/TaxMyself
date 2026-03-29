import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonColor, ButtonSize } from 'src/app/components/button/button.enum';
import { ICellRenderer } from 'src/app/shared/enums';
import {
  IColumnDataTable,
  IMobileCardConfig,
  IRowDataTable,
  ISelectItem,
  ITableRowAction,
} from 'src/app/shared/interface';
import { DateFormatPipe } from 'src/app/pipes/date-format.pipe';

@Component({
  selector: 'app-mobile-row-card',
  templateUrl: './mobile-row-card.component.html',
  styleUrls: ['./mobile-row-card.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, DateFormatPipe, ButtonComponent],
})
export class MobileRowCardComponent {

  // ─── Inputs ──────────────────────────────────────────────────────────────
  row        = input.required<IRowDataTable>();
  columns    = input.required<IColumnDataTable<any, any>[]>();
  config     = input.required<IMobileCardConfig>();
  actions    = input<ITableRowAction[]>([]);
  searchTerm = input<string>('');
  /** Color highlighted `sum` by sign when row has `__sumNumeric` (My Account unclassified). */
  sumSignColors = input<boolean>(false);
  unassignedBillRed = input<boolean>(false);

  // ─── Outputs ─────────────────────────────────────────────────────────────
  actionClicked = output<{ action: ITableRowAction; row: IRowDataTable }>();

  // ─── Internal signals ────────────────────────────────────────────────────
  expanded = signal(false);
  menuOpen = signal(false);

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

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update(v => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  onActionClick(action: ITableRowAction): void {
    this.menuOpen.set(false);
    this.actionClicked.emit({ action, row: this.row() });
  }

  billUnassigned(): boolean {
    const b = this.row()['billName'];
    return !b || String(b).trim() === '' || b === 'לא שוייך';
  }
}
