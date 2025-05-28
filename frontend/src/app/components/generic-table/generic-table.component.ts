import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, OnInit, output, signal, WritableSignal } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { ButtonGroupModule } from 'primeng/buttongroup';
import { InputIcon } from 'primeng/inputicon';
import { IconField } from 'primeng/iconfield';
import { TableModule } from 'primeng/table';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonComponent } from "../button/button.component";
import { ButtonColor, ButtonSize } from '../button/button.enum';
import { IColumnDataTable, IRowDataTable, IFilterItems } from 'src/app/shared/interface';
import { TruncatePointerDirective } from '../../directives/truncate-pointer.directive';
import { HighlightPipe } from "../../pipes/high-light.pipe";
import { animate, state, style, transition, trigger } from '@angular/animations';
import { AccountAssociationDialogComponent } from "../account-association-dialog/account-association-dialog.component";
import { FilterPanelComponent } from "../filter-panel/filter-panell.component";
import { FormGroup } from '@angular/forms';
import { is } from 'date-fns/locale';
import { set } from 'date-fns';

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
  ],
  templateUrl: './generic-table.component.html',
  styleUrls: ['./generic-table.component.scss'],
  imports: [CommonModule, InputIcon, IconField, InputGroupModule, InputGroupAddonModule, InputTextModule, ButtonComponent, TableModule, TruncatePointerDirective, HighlightPipe, ButtonModule, ButtonGroupModule, AccountAssociationDialogComponent, FilterPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,

})
export class GenericTableComponent<TFormColumns, TFormHebrewColumns> implements OnInit {

  title = input<string>();
  isLoadingState = input<boolean>(false);
  showButtons = input<boolean>(false);
  columnSearch = input<string>('name');
  tableHeight = input<string>('500px');
  placeholderSearch = input<string>();
  dataTable = input<IRowDataTable[]>([]);
  columnsTitle = input<IColumnDataTable<TFormColumns, TFormHebrewColumns>[]>([]);
  visibleAccountAssociationClicked = output<{ state: boolean, data: IRowDataTable }>();
  visibleClassifyTranClicked = output<{ state: boolean, data: IRowDataTable }>();
  filters = output<FormGroup>();
  visibleFilterPannel = signal(false);
  visibleAccountAssociationDialog = signal(false);
  searchTerm = signal<string>('');
  isHovering = signal<number>(null);


  readonly buttonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;


  expandedRows = new Set<number>();
  hoverTimeout: any;
  hoveredRowInfo = signal<{ row: any, top: number } | null>(null);
  isRowHovered = signal<boolean>(false);
  isFloatingHovered = signal<boolean>(false);
  isSlideIn = signal<boolean>(false);


  filteredDataTable = computed(() => {
    const data = this.dataTable();
    const term = this.searchTerm().toLowerCase().trim();
    const filtered = data?.filter(row => (String(row[this.columnSearch()]).includes(term)));
    console.log('filteredDataTable', filtered);
    return filtered;
  });

  constructor() { }

  ngOnInit() {}
  


  get isHoveringAnywhere() {
    return this.isRowHovered() || this.isFloatingHovered();
  }

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

  close(): void {
    console.log('close');
    this.visibleAccountAssociationDialog.set(false);

  }

  onVisibleAccountAssociationClicked(row: IRowDataTable): void {
    console.log('row in onVisibleAccountAssociationClicked:', row);
    console.log('event in onVisibleAccountAssociationClicked:', true);

    console.log('onVisibleAccountAssociationClicked');
    this.visibleAccountAssociationClicked.emit({ state: true, data: row });
  }

  onVisibleClassifyTranClicked(row: IRowDataTable): void {
    console.log('row in onVisibleAccountAssociationClicked:', row);
    console.log('event in onVisibleAccountAssociationClicked:', true);

    console.log('onVisibleAccountAssociationClicked');
    this.visibleClassifyTranClicked.emit({ state: true, data: row });
  }

  applyFilters(filters: FormGroup): void {
    console.log('applyFilters', filters);
    this.visibleFilterPannel.set(false);
    this.filters.emit(filters);
  }

}
