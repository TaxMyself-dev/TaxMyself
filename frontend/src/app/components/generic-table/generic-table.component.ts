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
import { FilterDialogComponent } from "../filter-dialog/filter-dialog.component"; // For add cursor pointer only to long text.
import { HighlightPipe } from "../../pipes/high-light.pipe";
import { animate, state, style, transition, trigger } from '@angular/animations';
import { AccountAssociationDialogComponent } from "../account-association-dialog/account-association-dialog.component";

@Component({
  selector: 'app-generic-table',
  standalone: true,
  animations: [
    trigger('slideIn', [
      state('void', style({ transform: 'translateX(-10%)', opacity: 0 })),
      state('visible', style({ transform: 'translateX(0)', opacity: 1 })),
      transition('void => visible', animate('600ms ease-out')),
      transition('visible => void', animate('200ms ease-in')),
    ])
  ],
  templateUrl: './generic-table.component.html',
  styleUrls: ['./generic-table.component.scss'],
  imports: [CommonModule, InputIcon, IconField, InputGroupModule, InputGroupAddonModule, InputTextModule, ButtonComponent, TableModule, TruncatePointerDirective, FilterDialogComponent, HighlightPipe, ButtonModule, ButtonGroupModule, AccountAssociationDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,

})
export class GenericTableComponent<TFormColumns, TFormHebrewColumns> implements OnInit {

  title = input<string>();
  columnSearch = input<string>('name');
  tableHeight = input<string>('500px');
  placeholderSearch = input<string>();
  dataTable = input<IRowDataTable[]>([]);
  columnsTitle = input<IColumnDataTable<TFormColumns, TFormHebrewColumns>[]>([]);
  visibleAccountAssociationClicked = output<{state: boolean, data: IRowDataTable}>();
  visibleClassifyTranClicked = output<{state: boolean, data: IRowDataTable}>();
  visibleFilterDialog = signal(false);
  visibleAccountAssociationDialog = signal(false);
  searchTerm = signal<string>('');
  isHovering = signal<number>(null);
  // hovered: number | null;

  readonly buttonSize = ButtonSize;
  readonly ButtonColor = ButtonColor;
  readonly filterItems: IFilterItems[] = [
    {
      defaultValue: 'monthly',
      name: 'בחר זמן',
      value: 'selectPeriodType',
      fields: [
        {
          name: 'חודשי',
          value: 'monthly',
          checkbox: false,
          multiple: false,
          checked: false,
          children: [
            {
              name: "בחר שנה",
              value: "year",
              checkbox: false,
              multiple: false,
              children: Array.from({ length: 15 }, (_, i) => {
                const year = new Date().getFullYear() - i;
                return { name: year.toString(), value: year.toString(), checkbox: false, multiple: false };
              })
            },
            {
              name: "בחר חודש",
              value: "month",
              checkbox: false,
              multiple: false,
              checked: false,
              children: [
                { name: 'ינואר', value: '01', checkbox: false, multiple: false },
                { name: 'פברואר', value: '02', checkbox: false, multiple: false },
                { name: 'March', value: '03', checkbox: false, multiple: false },
                { name: 'April', value: '04', checkbox: false, multiple: false },
                { name: 'May', value: '05', checkbox: false, multiple: false },
                { name: 'June', value: '06', checkbox: false, multiple: false },
                { name: 'July', value: '07', checkbox: false, multiple: false },
                { name: 'August', value: '08', checkbox: false, multiple: false },
                { name: 'September', value: '09', checkbox: false, multiple: false },
                { name: 'October', value: '10', checkbox: false, multiple: false },
                { name: 'November', value: '11', checkbox: false, multiple: false },
                { name: 'December', value: '12', checkbox: false, multiple: false },
              ]
            },
          ]
        },
        {
          name: 'דו-חודשי',
          value: 'bmonthly',
          checkbox: false,
          checked: false,
          multiple: false,
          children: [
            {
              name: "בחר שנה",
              value: "year",
              checkbox: false,
              multiple: false,
              children: Array.from({ length: 15 }, (_, i) => {
                const year = new Date().getFullYear() - i;
                return { name: year.toString(), value: year.toString(), checkbox: false, multiple: false };
              })
            },
            {
              name: "בחר חודש",
              value: "month",
              checkbox: false,
              multiple: false,
              children: [
                { name: 'January - February', value: '01-02', checkbox: false, multiple: false },
                { name: 'March - April', value: '03-04', checkbox: false, multiple: false },
                { name: 'May - June', value: '05-06', checkbox: false, multiple: false },
                { name: 'July - August', value: '07-08', checkbox: false, multiple: false },
                { name: 'September - October', value: '09-10', checkbox: false, multiple: false },
                { name: 'November - December', value: '11-12', checkbox: false, multiple: false },
              ]
            },
          ]
        },
        {
          name: 'Year',
          value: 'year',
          checkbox: false,
          checked: false,
          multiple: false,
          children: Array.from({ length: 15 }, (_, i) => {
            const year = new Date().getFullYear() - i;
            return { name: year.toString(), value: year.toString(), checkbox: false, multiple: false };
          })
        },
        {
          name: 'Range Date',
          value: 'rangeDate',
          checkbox: false,
          checked: false,
          multiple: false,
          children: [
            { name: 'Start Date', value: 'startDate', checkbox: false, multiple: false },
            { name: 'End Date', value: 'endDate', checkbox: false, multiple: false }
          ]
        },
      ]
    },
    {
      defaultValue: '',
      name: 'בחר חשבון',
      value: 'selectAccount',
      fields: [
        { name: 'Account 1', value: 'account1', checkbox: false, multiple: false },
        { name: 'Account 2', value: 'account2', checkbox: false, multiple: false },
        { name: 'Account 3', value: 'account3', checkbox: false, multiple: false },
        { name: 'Account 4', value: 'account4', checkbox: false, multiple: false },
        { name: 'Account 5', value: 'account5', checkbox: false, multiple: false },
      ]
    },
    {
      defaultValue: '',
      name: 'קטגוריה',
      value: 'selectCategory',
      fields: [
        { name: 'Category 1', value: 'category1', checkbox: false, multiple: false },
        { name: 'Category 2', value: 'category2', checkbox: false, multiple: false },
        { name: 'Category 3', value: 'category3', checkbox: false, multiple: false },
        { name: 'Category 4', value: 'category4', checkbox: false, multiple: false },
        { name: 'Category 5', value: 'category5', checkbox: false, multiple: false },
      ]
    }
  ];


  //   {
  //     label: 'Select Period Type',
  //     data: 'selectPeriodType',
  //     expanded: true,
  //     children: [
  //       {
  //         label: 'Monthly',
  //         data: 'monthly',
  //         expanded: true,
  //         children: [
  //           { label: 'January', data: '01' },
  //           { label: 'February', data: '02' },
  //           { label: 'March', data: '03' },
  //           { label: 'April', data: '04' },
  //           { label: 'May', data: '05' },
  //           { label: 'June', data: '06' },
  //           { label: 'July', data: '07' },
  //           { label: 'August', data: '08' },
  //           { label: 'September', data: '09' },
  //           { label: 'October', data: '10' },
  //           { label: 'November', data: '11' },
  //           { label: 'December', data: '12' }
  //         ]
  //       },
  //       {
  //         label: 'B-Monthly',
  //         data: 'bmonthly',
  //         expanded: true,
  //         children: [
  //           { label: 'January - February', data: '01-02' },
  //           { label: 'March - April', data: '03-04' },
  //           { label: 'May - June', data: '05-06' },
  //           { label: 'July - August', data: '07-08' },
  //           { label: 'September - October', data: '09-10' },
  //           { label: 'November - December', data: '11-12' }
  //         ]
  //       },
  //       {
  //         label: 'Year',
  //         data: 'year',
  //         expanded: true,
  //         children: Array.from({ length: 15 }, (_, i) => {
  //           const year = new Date().getFullYear() - i;
  //           return { label: year.toString(), data: year.toString() };
  //         })
  //       },
  //       {
  //         label: 'Range Date',
  //         data: 'rangeDate',
  //         expanded: true,
  //         children: [
  //           { label: 'Start Date', data: 'startDate' },
  //           { label: 'End Date', data: 'endDate' }
  //         ]
  //       }
  //     ]
  //   },
  //   {
  //     label: 'Select Account',
  //     data: 'selectAccount',
  //     expanded: true,
  //     children: [
  //       { label: 'Account 1', data: 'account1' },
  //       { label: 'Account 2', data: 'account2' },
  //       { label: 'Account 3', data: 'account3' },
  //       { label: 'Account 4', data: 'account4' },
  //       { label: 'Account 5', data: 'account5' }
  //     ]
  //   },
  //   {
  //     label: 'Select Category',
  //     data: 'selectCategory',
  //     expanded: true,
  //     children: [
  //       { label: 'Category 1', data: 'category1' },
  //       { label: 'Category 2', data: 'category2' },
  //       { label: 'Category 3', data: 'category3' },
  //       { label: 'Category 4', data: 'category4' },
  //       { label: 'Category 5', data: 'category5' }
  //     ]
  //   }
  // ];

  // BIMONTHLY = 'BIMONTHLY',
  // ANNUAL = 'ANNUAL',
  // DATE_RANGE = 'DATE_RANGE'
  expandedRows = new Set<number>();

  filteredDataTable = computed(() => {
    const data = this.dataTable();
    const term = this.searchTerm().toLowerCase().trim();
    const filtered = data?.filter(row => (String(row[this.columnSearch()]).includes(term)));
    console.log('filteredDataTable', filtered);
    return filtered;
  });

  constructor() { }

  ngOnInit() {
    console.log("this.columnsTitle:", this.columnsTitle());
    
  }

  onMouseEnter(i: number) {
    this.isHovering.set(i);
  }

  onMouseLeave(i: number) {
    this.isHovering.set(null);
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
    this.visibleFilterDialog.set(!this.visibleFilterDialog());
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

  onVisibleAccountAssociationClicked(row:IRowDataTable): void {
    console.log('row in onVisibleAccountAssociationClicked:', row);
    console.log('event in onVisibleAccountAssociationClicked:', true);
    
    console.log('onVisibleAccountAssociationClicked');
    this.visibleAccountAssociationClicked.emit({state: true, data: row});
  }

  onVisibleClassifyTranClicked(row:IRowDataTable): void {
    console.log('row in onVisibleAccountAssociationClicked:', row);
    console.log('event in onVisibleAccountAssociationClicked:', true);
    
    console.log('onVisibleAccountAssociationClicked');
    this.visibleClassifyTranClicked.emit({state: true, data: row});
  }
  
}
