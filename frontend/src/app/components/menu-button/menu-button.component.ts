import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import {
  CdkConnectedOverlay,
  CdkOverlayOrigin,
  ConnectedPosition,
} from '@angular/cdk/overlay';
import { NgTemplateOutlet } from '@angular/common';
import { ButtonComponent } from '../button/button.component';
import { ButtonColor, ButtonSize } from '../button/button.enum';
import {
  MenuButtonActionItem,
  MenuButtonItem,
  MenuButtonSelectableItem,
} from './menu-button.model';

/**
 * Generic icon-trigger + popup menu, extracted from the Expense-Analysis filter
 * button pattern (CDK connected overlay). Two content modes:
 *   1. `[items]` — renders a standard menu list (actions / checkboxes / toggles
 *      / separators / templates).
 *   2. projected `<ng-content>` — host any custom content in the same popup with
 *      the identical trigger + overlay behavior.
 *
 * Deliberately knows nothing about its callers (no TopNav / filter specifics).
 */
@Component({
  selector: 'app-menu-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CdkOverlayOrigin, CdkConnectedOverlay, NgTemplateOutlet, ButtonComponent],
  templateUrl: './menu-button.component.html',
  styleUrl: './menu-button.component.scss',
})
export class MenuButtonComponent {
  /** Menu rows. Leave empty to project custom content via `<ng-content>`. */
  readonly items = input<MenuButtonItem[]>([]);

  // ── Trigger appearance (defaults mirror the Expense-Analysis filter button) ──
  readonly icon = input<string>('pi pi-filter-fill');
  /**
   * Optional label. When set, the trigger renders as a normal text button
   * (icon + label) instead of icon-only — used by primary CTAs like Home
   * "הוספת הוצאה".
   */
  readonly buttonText = input<string | null>(null);
  readonly buttonColor = input<ButtonColor>(ButtonColor.WHITE_BORDER);
  readonly buttonSize = input<ButtonSize>(ButtonSize.ICON);
  readonly variant = input<'outlined' | 'text' | null>(null);
  readonly ariaLabel = input<string>('פתיחת תפריט');
  readonly disabled = input<boolean>(false);
  /** Icon placement when `buttonText` is set. Ignored for icon-only triggers. */
  readonly iconPosition = input<'left' | 'right' | 'bottom' | 'top'>('right');

  readonly isIconOnly = computed(() => !this.buttonText());

  /** Min-width of the popup card (items mode only). */
  readonly menuMinWidth = input<string>('200px');

  /** Overlay placement — defaults to right-aligned, matching the filter popup. */
  readonly positions = input<ConnectedPosition[]>([
    { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 8 },
    { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -8 },
    { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  ]);

  readonly opened = output<void>();
  readonly closed = output<void>();
  /** Emitted after an `action` row is activated. */
  readonly itemClick = output<MenuButtonActionItem>();
  /** Emitted after a `checkbox` / `toggle` row changes state. */
  readonly checkedChange = output<{ item: MenuButtonSelectableItem; checked: boolean }>();

  readonly open = signal(false);
  readonly hasItems = computed(() => this.items().length > 0);

  readonly ButtonColor = ButtonColor;
  readonly ButtonSize = ButtonSize;

  toggle(): void {
    this.open() ? this.close() : this.openMenu();
  }

  openMenu(): void {
    if (this.disabled() || this.open()) return;
    this.open.set(true);
    this.opened.emit();
  }

  close(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.closed.emit();
  }

  onActionClick(item: MenuButtonActionItem): void {
    if (item.disabled) return;
    item.action?.();
    this.itemClick.emit(item);
    if (item.closeOnClick ?? true) this.close();
  }

  onToggle(item: MenuButtonSelectableItem): void {
    if (item.disabled) return;
    const checked = !item.checked;
    item.onChange?.(checked);
    this.checkedChange.emit({ item, checked });
    if (item.closeOnClick ?? false) this.close();
  }
}
