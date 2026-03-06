import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  forwardRef,
  input,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SegmentedOption {
  label: string;
  value: any;
}

@Component({
  selector: 'app-segmented-control',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './segmented-control.component.html',
  styleUrl: './segmented-control.component.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SegmentedControlComponent),
      multi: true,
    },
  ],
})
export class SegmentedControlComponent implements ControlValueAccessor {

  // ── Inputs ──────────────────────────────────────────────────────
  options  = input<SegmentedOption[]>([]);
  ariaLabel = input<string | undefined>(undefined);

  // ── Outputs ─────────────────────────────────────────────────────
  /** Emits the selected value — use for non-form (event-driven) usage. */
  valueChange = output<any>();

  // ── Internal state ───────────────────────────────────────────────
  readonly selectedValue = signal<any>(null);
  readonly isDisabled    = signal<boolean>(false);

  // Used for programmatic focus after keyboard navigation
  private readonly optionButtons =
    viewChildren<ElementRef<HTMLButtonElement>>('optionBtn');

  // ── ControlValueAccessor ─────────────────────────────────────────
  private onChange: (value: any) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: any): void {
    this.selectedValue.set(value ?? null);
  }

  registerOnChange(fn: (value: any) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.isDisabled.set(isDisabled);
  }

  // ── Event handlers ───────────────────────────────────────────────

  select(value: any): void {
    if (this.isDisabled()) return;
    this.selectedValue.set(value);
    this.onChange(value);
    this.onTouched();
    this.valueChange.emit(value);
  }

  /**
   * Roving-tabindex keyboard handler (WAI-ARIA radiogroup pattern).
   *
   * RTL note: Arrow navigation follows DOM/logical order, not visual order.
   * ArrowRight/Down = next option; ArrowLeft/Up = previous option.
   * Screen readers handle the RTL visual mapping automatically.
   */
  onKeydown(event: KeyboardEvent, currentIndex: number): void {
    const opts = this.options();
    if (!opts.length) return;

    let nextIndex: number | null = null;

    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % opts.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + opts.length) % opts.length;
        break;
      case ' ':
      case 'Enter':
        event.preventDefault();
        this.select(opts[currentIndex].value);
        return;
      default:
        return;
    }

    event.preventDefault();
    this.select(opts[nextIndex].value);

    // Shift DOM focus to the newly active button immediately
    this.optionButtons()[nextIndex]?.nativeElement.focus();
  }

  /**
   * Roving tabindex: only the selected option (or the first if none is
   * selected) is reachable via Tab; the rest use tabindex="-1".
   */
  tabIndex(index: number): number {
    const selected = this.selectedValue();
    const opts     = this.options();
    if (selected !== null && opts[index]?.value === selected) return 0;
    if (selected === null && index === 0) return 0;
    return -1;
  }
}
