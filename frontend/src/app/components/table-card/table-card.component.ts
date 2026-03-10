import { CommonModule } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { ITransactionData } from 'src/app/shared/interface';

@Component({
  selector: 'app-table-card',
  templateUrl: './table-card.component.html',
  styleUrls: ['./table-card.component.scss'],
  standalone: true,
  imports: [CommonModule],
})
export class TableCardComponent {
  transaction = input.required<ITransactionData>();
  menuClicked = output<ITransactionData>();

  onMenuClick(event: Event): void {
    event.stopPropagation();
    this.menuClicked.emit(this.transaction());
  }
}
