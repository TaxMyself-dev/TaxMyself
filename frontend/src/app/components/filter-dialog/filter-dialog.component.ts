import { CommonModule } from '@angular/common';
import { Component, Input, input, OnInit, signal } from '@angular/core';
import { Dialog } from 'primeng/dialog';
import { CardModule } from 'primeng/card';
import { ButtonComponent } from "../button/button.component";
import { ButtonSize } from '../button/button.enum';
import { IFilterItems, ISubFilterList } from 'src/app/shared/interface';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TreeSelectModule } from 'primeng/treeselect';
import { TreeNode } from 'primeng/api';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { FormsModule } from '@angular/forms';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { OverlayPanelModule } from 'primeng/overlaypanel';
import { DropdownModule } from 'primeng/dropdown';
import { CalendarModule } from 'primeng/calendar';
import { is } from 'date-fns/locale';

export interface FilterOption {
  label: string;
  // סוג האינפוט: dropdown – בחירה מתוך רשימה, dialog – לחצן הפותח דיאלוג, date – אינפוט תאריך
  type: 'dropdown' | 'dialog' | 'date';
  // האם ניתן לבחור ערך אחד או מספר ערכים (למשל בחשבונות וקטגוריות)
  selectionMode?: 'single' | 'multiple';
  // מערך תתי אופציות – עבור בנים, נכדים, נינים
  children?: FilterOption[];
  // הערך שנבחר (יכול להיות ערך בודד או מערך)
  value?: any;
}

@Component({
  selector: 'app-filter-dialog',
  templateUrl: './filter-dialog.component.html',
  styleUrls: ['./filter-dialog.component.scss'],
  standalone: true,
  imports: [Dialog, CommonModule, CardModule, ButtonComponent, SelectModule, MultiSelectModule, TreeSelectModule, InputGroupModule, InputGroupAddonModule, CheckboxModule, InputTextModule, FormsModule, ButtonModule, OverlayPanelModule, DropdownModule, CalendarModule],
})

export class FilterDialogComponent implements OnInit {
  // הקומפוננטה גנרית – ניתן להעביר את הנתונים מבחוץ. במקרה שלא נשלחו נתונים, נטען פייק דאטה.
  @Input() filters: FilterOption[] = [];
  visible =input<boolean>(false);
  filterFields =input<IFilterItems[]>([]);
  isOpenTime = signal(false);
  isSelected = signal('');
  isChecked = signal(false);
  accountFilter?: FilterOption;
  categoryFilter?: FilterOption;


  options = [
    { label: 'Option 1', value: 'option1' },
    { label: 'Option 2', value: 'option2' },
    { label: 'Option 3', value: 'option3' },
    { label: 'Option 4', value: 'option4' },
    { label: 'Option 5', value: 'option5' }
  ];

  selectedValues: any[] = [];

  // שליטת תצוגה לדיאלוג הראשי
  displayFilterDialog: boolean = true;
  // דיאלוגים עבור בחירת חשבון וקטגוריה
  accountDialogVisible: boolean = false;
  categoryDialogVisible: boolean = false;
  // דיאלוג לבחירת ערך מתוך מערך הנינים (Great-Grandchildren)
  greatGrandDialogVisible: boolean = false;
  // משתנים לשמירת מצב בחירת נינים
  currentGreatGrandOptions: FilterOption[] = [];
  currentGreatGrandParent: FilterOption | null = null;

  ngOnInit() {
  
  }
  openSelect(event: string) {
    console.log("🚀 ~ FilterDialogComponent ~ openSelect ~ event:", event)
    this.isOpenTime.set(!this.isOpenTime());
    this.isSelected.set(event);
  }

  onCheckboxChange(event: any) {
    event.checked = false;
    console.log("🚀 ~ FilterDialogComponent ~ onCheckboxChange ~ event:", event);
    console.log("🚀 ~ FilterDialogComponent ~ onCheckboxChange ~ value:", event.originalEvent.target.value);
    const array = this.filterFields().find((item) => item.name === this.isSelected());
    array.fields.forEach(item => item.checked = true);
    // this.options.forEach(option => option.selected = false);

    console.log("🚀 ~ FilterDialogComponent ~ onCheckboxChange ~ array:", array)
    const subArray = array.fields.find((item) => item.name === event.originalEvent.target.value);
    console.log("🚀 ~ FilterDialogComponent ~ onCheckboxChange ~ subArray:", subArray)
    console.log("🚀 ~ FilterDialogComponent ~ onCheckboxChange ~ children:", subArray.children)
  }

}


// ======================== cluad ====================================================
// filter.component.ts
// filter.component.ts
// import { Component, Input, OnInit } from '@angular/core';
// import { CommonModule } from '@angular/common';
// import { FormsModule } from '@angular/forms';
// import { ButtonModule } from 'primeng/button';
// import { DialogModule } from 'primeng/dialog';
// import { CheckboxModule } from 'primeng/checkbox';
// import { CalendarModule } from 'primeng/calendar';

// import { FilterItem, FilterChild, FilterGrandchild } from './filter.interface';

// @Component({
//   selector: 'app-filter-dialog',
//   standalone: true,
//   imports: [
//     CommonModule,
//     FormsModule,
//     ButtonModule,
//     DialogModule,
//     CheckboxModule,
//     CalendarModule
//   ],
//   templateUrl: './filter-dialog.component.html',
//   styleUrl: './filter-dialog.component.scss'
// })
// export class FilterDialogComponent implements OnInit {
//   @Input() filters: FilterItem[] = [];
  
//   visibleChildrenDialog = false;
//   visibleGreatgrandchildrenDialog = false;
//   currentParent: FilterItem | null = null;
//   currentChild: FilterChild | null = null;
//   currentGrandchild: FilterGrandchild | null = null;
//   selectedChildren: string[] = [];
//   selectedGreatgrandchildren: string[] = [];
  
//   constructor() {}

//   ngOnInit() {
//     if (!this.filters || this.filters.length === 0) {
//       // Create mock data if no data is provided
//       this.createMockData();
//     }
//   }

//   createMockData() {
//     // Mock data structure
//     this.filters = [
//       {
//         name: 'בחר זמן',
//         children: [
//           {
//             name: 'חודשי',
//             grandchildren: [
//               {
//                 name: 'בחר שנה',
//                 greatgrandchildren: Array.from({length: 15}, (_, i) => (new Date().getFullYear() - i).toString())
//               },
//               {
//                 name: 'בחר חודש',
//                 greatgrandchildren: ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר']
//               }
//             ]
//           },
//           {
//             name: 'דו חודשי',
//             grandchildren: [
//               {
//                 name: 'בחר שנה',
//                 greatgrandchildren: Array.from({length: 15}, (_, i) => (new Date().getFullYear() - i).toString())
//               },
//               {
//                 name: 'בחר חודשים',
//                 greatgrandchildren: ['ינואר-פברואר', 'מרץ-אפריל', 'מאי-יוני', 'יולי-אוגוסט', 'ספטמבר-אוקטובר', 'נובמבר-דצמבר']
//               }
//             ]
//           },
//           {
//             name: 'שנה',
//             grandchildren: [
//               {
//                 name: 'בחר שנה',
//                 greatgrandchildren: Array.from({length: 15}, (_, i) => (new Date().getFullYear() - i).toString())
//               }
//             ]
//           },
//           {
//             name: 'טווח תאריכים',
//             isDateRange: true,
//             startDate: new Date(),
//             endDate: new Date()
//           }
//         ]
//       },
//       {
//         name: 'בחר חשבון',
//         children: [
//           { name: 'חשבון 1', checkable: true, multiSelect: true },
//           { name: 'חשבון 2', checkable: true, multiSelect: true },
//           { name: 'חשבון 3', checkable: true, multiSelect: true },
//           { name: 'חשבון 4', checkable: true, multiSelect: true },
//           { name: 'חשבון 5', checkable: true, multiSelect: true }
//         ]
//       },
//       {
//         name: 'בחר קטגוריה',
//         children: [
//           { name: 'קטגוריה 1', checkable: true, multiSelect: true },
//           { name: 'קטגוריה 2', checkable: true, multiSelect: true },
//           { name: 'קטגוריה 3', checkable: true, multiSelect: true },
//           { name: 'קטגוריה 4', checkable: true, multiSelect: true },
//           { name: 'קטגוריה 5', checkable: true, multiSelect: true }
//         ]
//       }
//     ];
//   }

//   // Helper method to get button label
//   getButtonLabel(filter: FilterItem): string {
//     if (!filter.selectedValue) {
//       return filter.name;
//     }
    
//     if (Array.isArray(filter.selectedValue)) {
//       return filter.selectedValue.join(', ');
//     }
    
//     return filter.selectedValue;
//   }

//   openChildrenDialog(parent: FilterItem) {
//     console.log("🚀 ~ FilterDialogComponent ~ openChildrenDialog ~ parent:", parent)
    
//     this.currentParent = parent;
//     this.selectedChildren = [];
    
//     // If parent already has selected values and they are in array format, populate selectedChildren
//     if (this.currentParent.selectedValue && Array.isArray(this.currentParent.selectedValue)) {
//       this.selectedChildren = [...this.currentParent.selectedValue];
//     }
    
//     // Special case for accounts and categories
//     // if (parent.name === 'בחר חשבון' || parent.name === 'בחר קטגוריה') {
//       this.visibleChildrenDialog = true;
//     // }
//   }

//   selectChild(child: FilterChild) {
//     if (this.currentParent) {
//       this.currentParent.selectedChild = child;
      
//       // For time selection, we don't open a dialog
//       if (this.currentParent.name === 'בחר זמן') {
//         this.closeChildrenDialog();
//       }
//     }
//   }

//   openGreatgrandchildrenDialog(grandchild: FilterGrandchild) {
//     this.currentGrandchild = grandchild;
//     this.selectedGreatgrandchildren = [];
//     this.visibleGreatgrandchildrenDialog = true;
//   }

//   selectGreatgrandchild(greatgrandchild: string) {
//     if (this.currentGrandchild) {
//       this.currentGrandchild.selectedGreatgrandchild = greatgrandchild;
//       this.closeGreatgrandchildrenDialog();
//     }
//   }

//   closeChildrenDialog() {
//     this.visibleChildrenDialog = false;
    
//     // Update the selected value for the parent
//     if (this.currentParent && this.currentParent.selectedChild) {
//       if ((this.currentParent.name === 'בחר חשבון' || this.currentParent.name === 'בחר קטגוריה') && this.selectedChildren.length > 0) {
//         this.currentParent.selectedValue = this.selectedChildren;
//       } else {
//         this.currentParent.selectedValue = this.currentParent.selectedChild.name;
//       }
//     }
//     this.currentParent = null;
//   }

//   closeGreatgrandchildrenDialog() {
//     this.visibleGreatgrandchildrenDialog = false;
//     this.currentGrandchild = null;
//   }

//   toggleChildSelection(childName: string) {
//     const index = this.selectedChildren.indexOf(childName);
//     if (index > -1) {
//       this.selectedChildren.splice(index, 1);
//     } else {
//       this.selectedChildren.push(childName);
//     }
//   }

//   isChildSelected(childName: string): boolean {
//     return this.selectedChildren.includes(childName);
//   }
// }