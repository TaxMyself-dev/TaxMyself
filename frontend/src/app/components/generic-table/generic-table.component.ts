import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, OnInit } from '@angular/core';
// import { ButtonModule } from 'primeng/button';
// import { IconFieldModule } from 'primeng/iconfield';
// import { InputIconModule } from 'primeng/inputicon';
import { InputIcon } from 'primeng/inputicon';
import { IconField } from 'primeng/iconfield';
import { TableModule } from 'primeng/table';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { IColumnDataTable, IRowDataTable } from 'src/app/shared/interface';
import { TruncatePointerDirective } from '../../directives/truncate-pointer.directive'; // For add cursor pointer only to long text.

@Component({
  selector: 'app-generic-table',
  standalone: true,
  templateUrl: './generic-table.component.html',
  styleUrls: ['./generic-table.component.scss'],
  imports: [CommonModule, InputIcon, IconField, InputGroupModule, InputGroupAddonModule, InputTextModule, ButtonComponent, TableModule, TruncatePointerDirective],  
  changeDetection: ChangeDetectionStrategy.OnPush,

})
export class GenericTableComponent<TFormColumns, TFormHebrewColumns>  implements OnInit {
  title = input<string>();
  tableHeight = input<string>('500px');
  placeholderSearch = input<string>();
  dataTable = input<IRowDataTable[]>([]);
  columnsTitle = input<IColumnDataTable<TFormColumns, TFormHebrewColumns>[]>([]);

  readonly buttonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;
  expandedRows = new Set<number>();

  constructor() { }

  ngOnInit() {}

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
}
