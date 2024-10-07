import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-tab-bar',
  templateUrl: './tab-bar.component.html',
  styleUrls: ['./tab-bar.component.scss'],
})
export class TabBarComponent {
  @Input() tabs: { id: string, label: string }[];  // Input for the tabs
  @Input() selectedTab: string;                    // Input for the currently selected tab
  @Output() tabChanged = new EventEmitter<string>(); // Output event when the tab changes

  selectTab(tabId: string) {
    this.tabChanged.emit(tabId); // Emit the selected tab to the parent component
  }
}
