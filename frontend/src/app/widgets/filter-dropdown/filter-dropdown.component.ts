import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  HostListener,
  input,
  output,
  signal,
} from '@angular/core';
import { CdkConnectedOverlay, CdkOverlayOrigin, ConnectedPosition } from '@angular/cdk/overlay';
import { FilterGroup, FilterOption } from 'src/app/pages/flow-analysis/flow-analysis-filter.interfaces';

@Component({
  selector: 'app-filter-dropdown',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkConnectedOverlay, CdkOverlayOrigin],
  templateUrl: './filter-dropdown.component.html',
  styleUrls: ['./filter-dropdown.component.scss'],
})
export class FilterDropdownComponent {
  // ── Inputs ──────────────────────────────────────────────────────────────
  items            = input<FilterOption[]>([]);
  groupedItems     = input<FilterGroup[]>([]);
  isGrouped        = input(false);
  title            = input<string | null>(null);
  showBack         = input(false);
  placeholder      = input('חיפוש...');
  selectedIds      = input<ReadonlySet<string>>(new Set());
  activeCount      = input(0);
  isDisabled       = input(false);
  disabledTooltip  = input('חייב לבחור חשבון לפני');

  // ── Outputs ─────────────────────────────────────────────────────────────
  readonly itemClicked = output<string>();
  readonly backClicked = output<void>();
  readonly clearAll    = output<void>();

  // ── Overlay positions ────────────────────────────────────────────────────
  readonly positions: ConnectedPosition[] = [
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
    { originX: 'end',   originY: 'bottom', overlayX: 'end',   overlayY: 'top', offsetY: 8 },
  ];

  // ── Internal state ───────────────────────────────────────────────────────
  readonly isOpen    = signal(false);
  readonly searchRaw = signal('');

  readonly filteredItems = computed(() => {
    const q = this.searchRaw().trim().toLowerCase();
    if (!q) return this.items();
    return this.items().filter(i => i.label.toLowerCase().includes(q));
  });

  readonly filteredGrouped = computed(() => {
    const q = this.searchRaw().trim().toLowerCase();
    if (!q) return this.groupedItems();
    return this.groupedItems()
      .map(g => ({ ...g, items: g.items.filter(i => i.label.toLowerCase().includes(q)) }))
      .filter(g => g.items.length > 0);
  });

  constructor() {
    // Clear search whenever the screen switches (showBack changes)
    effect(() => {
      this.showBack();
      this.searchRaw.set('');
    });
  }

  // ── Overlay control ──────────────────────────────────────────────────────
  open(): void {
    if (this.isDisabled()) return;
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.isOpen()) this.close();
  }

  // ── Item click ───────────────────────────────────────────────────────────
  onItemClick(id: string): void {
    this.itemClicked.emit(id);
    // Close panel after selection from an inner screen
    if (this.showBack()) {
      this.close();
    }
  }

  // ── Clear all ────────────────────────────────────────────────────────────
  onClearAll(): void {
    this.clearAll.emit();
    this.close();
  }

  // ── Search ───────────────────────────────────────────────────────────────
  onSearch(event: Event): void {
    this.searchRaw.set((event.target as HTMLInputElement).value);
  }
}
