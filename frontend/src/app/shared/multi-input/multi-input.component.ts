import { Component, ElementRef, EventEmitter, Input, OnInit, Output, Renderer2, ViewChild } from '@angular/core';
import { SharedModule } from "../shared.module";
import { ISelectItem } from '../interface';
import { FormControl, FormGroup } from '@angular/forms';

@Component({
  selector: 'app-multi-input',
  templateUrl: './multi-input.component.html',
  styleUrls: ['./multi-input.component.scss'],
  //imports: [SharedModule],
})

export class MultiInputComponent  implements OnInit {

  @Input() set items(val: ISelectItem[] ) {
    this.filteredCategories = [...val];
    this.fullItems = [...val];
  }
  @Input() parentForm: FormGroup;
  @Input() errorText: string;
  @Input() className: string;
  @Input() controlName: string;
  
  @Input() set title (val: string) {
    this.inputLabelName = val;
  }
  // @Input() set disabled(val: boolean) {
  //   const currentFormControl = this.currentFormControl();
  //   if (currentFormControl) {
  //     if (val) {
  //       currentFormControl.disable();
  //     } else {
  //       currentFormControl.enable();
  //     }
  //   }
  // }

  @Output() onInputChange: EventEmitter<string> = new EventEmitter<string>();  // for non form inputs


  inputLabelName: string;
  categoryInput: string = ''; // Bound to the input
  showDropdown: boolean = false;
  filteredCategories: ISelectItem[];
  fullItems: ISelectItem[];
  popoverStyles: { [key: string]: string } = {};

  @ViewChild('inputElement', { static: false }) inputElement!: ElementRef;

  constructor(private renderer: Renderer2) { }

  ngOnInit() {}

  get items(): ISelectItem[] {
    return this.filteredCategories
  }
  // currentFormControl(): FormControl {
  //   return (this.parentForm && this.controlName) ? this.parentForm.get(this.controlName) as FormControl: null;
  // }

  toggleDropdown() {
    this.showDropdown = !this.showDropdown;
    console.log("show drop: ", this.showDropdown);
    
    // if (this.showDropdown) {
    //   this.disableBodyScroll();
    // } else {
    //   this.enableBodyScroll();
    // }
    this.setPopoverPosition();
  }

  filterCategories() {
    const inputValue = this.categoryInput.toLowerCase();
    this.filteredCategories = this.fullItems.filter((category) =>
      category.value.toString().toLowerCase().includes(inputValue)
    );
    if (this.categoryInput.length < 0 || this.filteredCategories.length === 0 || inputValue === "") {
      this.showDropdown = false;
    }
    else {
      this.showDropdown = true;
    }
  }

  selectCategory(category: string) {
    console.log("select category: ", category);
    console.log("before categoryInput: ", this.categoryInput);
    
    this.categoryInput = "";
    console.log("between categoryInput: ", this.categoryInput);
    this.categoryInput = category; // Set the input to the selected category
    console.log("after categoryInput: ", this.categoryInput);
    this.showDropdown = false; // Close the dropdown
    console.log("show drop: ", this.showDropdown);
  }

  setPopoverPosition() {
    if (this.inputElement) {
      const rect = this.inputElement.nativeElement.getBoundingClientRect();
      this.popoverStyles = {
        top: `${rect.bottom + window.scrollY}px`,
        left: `${rect.left + window.scrollX}px`,
        width: `${rect.width}px`,
      };
    }
  }

  // disableBodyScroll() {
  //   console.log("in disable");
    
  //   this.renderer.addClass(document.body, 'no-scroll');
  // }

  // enableBodyScroll() {
  //   this.renderer.removeClass(document.body, 'no-scroll');
  // }

}
