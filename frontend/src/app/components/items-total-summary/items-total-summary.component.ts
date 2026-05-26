import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  signal,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';

import { ISummaryItem } from 'src/app/pages/doc-create/doc-create.interface';
import { DocumentSummary } from 'src/app/pages/doc-create/doc-cerate.enum';

@Component({
  selector: 'app-items-total-summary',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  templateUrl: './items-total-summary.component.html',
  styleUrl: './items-total-summary.component.scss',
})
export class ItemsTotalSummaryComponent {

  summaryItems  = input<ISummaryItem[]>([]);
  documentSummary = input.required<DocumentSummary>();

  readonly isExpanded = signal(false);

  readonly breakdownItems = computed(() => this.summaryItems().slice(0, -1));

  readonly totalItem = computed(() => {
    const items = this.summaryItems();
    return items.length > 0 ? items[items.length - 1] : null;
  });

  readonly totalAmount = computed(() => {
    const item = this.totalItem();
    return item ? item.valueGetter(this.documentSummary()) : 0;
  });

  toggle(): void {
    this.isExpanded.update(v => !v);
  }
}
