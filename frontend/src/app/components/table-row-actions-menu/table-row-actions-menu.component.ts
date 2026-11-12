import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, NgZone, inject, input, output, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { IGenericTableAction } from '../generic-table/table-actions';

/** Shared mobile menu. The table resolves visibility for cards and ordinary rows. */
@Component({
  selector: 'app-table-row-actions-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (actions().length) {
      <button type="button" class="actions-trigger" aria-label="פעולות לשורה"
        [attr.aria-expanded]="open()" (click)="toggle($event)">
        <i class="pi pi-ellipsis-v" aria-hidden="true"></i>
      </button>
      @if (open()) {
        <div class="actions-dropdown" dir="rtl" [style.left.px]="position().left"
          [style.top.px]="position().top" [style.bottom.px]="position().bottom"
          [style.width.px]="position().width" [style.max-height.px]="position().maxHeight"
          (click)="$event.stopPropagation()">
          @for (action of actions(); track action.name) {
            <button type="button" class="action-item" [disabled]="!!action.isLoading?.()"
              (click)="select(action, $event)">
              <i [class]="action.isLoading?.() ? 'pi pi-spin pi-spinner' : action.icon" aria-hidden="true"></i>
              <span>{{ action.title || action.name }}</span>
            </button>
          }
        </div>
      }
    }
  `,
  styles: [`
    :host { display: block; position: relative; }
    .actions-trigger { min-width: 44px; min-height: 44px; border: 1px solid #ebebeb;
      border-radius: 50%; background: white; color: #363636; }
    .actions-dropdown { position: fixed; min-width: 180px; overflow-y: auto;
      padding: 4px 0; border: 1px solid #ebebeb; border-radius: 8px;
      background: white; box-shadow: 0 4px 12px #0000001a; z-index: 100; }
    .action-item { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px;
      padding: 10px 16px; border: 0; background: transparent; color: #363636;
      font-size: 14px; text-align: right; white-space: normal; }
    .action-item:hover { background: #f5f5f5; }
    .action-item:disabled { opacity: .6; cursor: wait; }
    .action-item i { color: #808080; }
  `],
})
export class TableRowActionsMenuComponent {
  actions = input<IGenericTableAction[]>([]);
  actionClicked = output<IGenericTableAction>();
  open = signal(false);
  position = signal<{ left: number; top: number | null; bottom: number | null; width: number; maxHeight: number }>({
    left: 8, top: 0, bottom: null, width: 260, maxHeight: 300,
  });
  private element = inject(ElementRef);

  private readonly document = inject(DOCUMENT);
  private readonly zone = inject(NgZone);
  private removeOpenListeners: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopListening());
  }

  private listenWhileOpen(): void {
    const view = this.document.defaultView;
    this.zone.runOutsideAngular(() => {
      const outside = (event: Event) => {
        if (!this.element.nativeElement.contains(event.target)) {
          this.zone.run(() => this.close());
        }
      };
      const escape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') this.zone.run(() => this.close());
      };
      const reposition = () => this.zone.run(() => this.close());
      for (const type of ['click', 'pointerdown', 'focusin']) this.document.addEventListener(type, outside);
      this.document.addEventListener('keydown', escape);
      view?.addEventListener('resize', reposition);
      view?.addEventListener('scroll', reposition);
      this.removeOpenListeners = () => {
        for (const type of ['click', 'pointerdown', 'focusin']) this.document.removeEventListener(type, outside);
        this.document.removeEventListener('keydown', escape);
        view?.removeEventListener('resize', reposition);
        view?.removeEventListener('scroll', reposition);
      };
    });
  }

  private stopListening(): void {
    this.removeOpenListeners?.();
    this.removeOpenListeners = null;
  }

  close(): void {
    this.stopListening();
    this.open.set(false);
  }

  toggle(event: Event): void {
    event.stopPropagation();
    if (this.open()) {
      this.close();
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const width = Math.min(260, window.innerWidth - 16);
    const above = rect.bottom > window.innerHeight / 2;
    this.position.set({
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: above ? null : rect.bottom + 4,
      bottom: above ? window.innerHeight - rect.top + 4 : null,
      width,
      maxHeight: Math.max(44, (above ? rect.top : window.innerHeight - rect.bottom) - 12),
    });
    this.open.set(true);
    this.listenWhileOpen();
  }

  select(action: IGenericTableAction, event: Event): void {
    event.stopPropagation();
    if (action.isLoading?.()) return;
    this.close();
    this.actionClicked.emit(action);
  }
}
