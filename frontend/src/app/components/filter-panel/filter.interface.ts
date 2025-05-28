// filter.types.ts
export interface FilterItem {
    name: string;
    children?: FilterChild[];
    selectedChild?: FilterChild;
    selectedValue?: string | string[];
  }
  
  export interface FilterChild {
    name: string;
    grandchildren?: FilterGrandchild[];
    selectedGrandchild?: FilterGrandchild;
    checkable?: boolean;
    multiSelect?: boolean;
    isDateRange?: boolean;
    startDate?: Date;
    endDate?: Date;
  }
  
  export interface FilterGrandchild {
    name: string;
    greatgrandchildren?: string[];
    selectedGreatgrandchild?: string;
    checkable?: boolean;
    multiSelect?: boolean;
  }