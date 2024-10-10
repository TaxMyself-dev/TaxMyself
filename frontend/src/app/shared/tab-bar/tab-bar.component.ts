import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-tab-bar',
  templateUrl: './tab-bar.component.html',
  styleUrls: ['./tab-bar.component.scss']
})
export class TabBarComponent {
  @Input() selectedTab: string = '';  // Input for the currently selected tab
  //@Input() tabs: { label: string, value: string, type: string, content?: string, component?: any }[] = [];
  @Input() tabs: { label: string, value: string, component?: any }[] = [];

  @Output() selectedTabChange = new EventEmitter<string>();  // Output event to emit tab changes

  // Handle tab selection and emit the new value to the parent component
  onTabSelect(event: any) {
    const customEvent = event as CustomEvent;
    this.selectedTab = customEvent.detail.value;  // Update the selected tab
    this.selectedTabChange.emit(this.selectedTab);  // Emit the change
    console.log("selected tab is ", this.selectedTab);
  }
}