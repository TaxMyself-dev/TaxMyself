import { Component, EventEmitter, INJECTOR, Input, OnInit, Output } from '@angular/core';

@Component({
  selector: 'app-collaps',
  templateUrl: './collapse.component.html',
  styleUrls: ['./collapse.component.scss'],
})
export class collapseComponent  implements OnInit {

  @Input() title: string;
  @Output() handleOpen = new EventEmitter<boolean>();
  iconString: string = "chevron-down-outline";
  isOpen: boolean = false;
  constructor() { }

  ngOnInit() {}

  handleClick(): void {
    console.log("clicked");
    console.log(this.isOpen);
    this.isOpen = !this.isOpen;
    console.log(this.isOpen);
    this.handleIcon();
    this.handleOpen.emit(this.isOpen);
  }
  
  handleIcon(): void {
    console.log("handle icon");
    
    this.isOpen ? this.iconString = "chevron-down-outline" : this.iconString = "chevron-forward-outline";
  }

}
