import { Component, EventEmitter, INJECTOR, Input, OnInit, Output, TemplateRef } from '@angular/core';

@Component({
  selector: 'app-collapse',
  templateUrl: './collapse.component.html',
  styleUrls: ['./collapse.component.scss'],
})
export class collapseComponent  implements OnInit {

  @Input() title: string;
  @Input() customTemplate: TemplateRef<any>;
  
  @Output() handleOpen = new EventEmitter<boolean>();

  isOpen: boolean = false;
  arrowDirrection = "left";

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
    
    this.isOpen ? this.arrowDirrection = "down" : this.arrowDirrection = "left";
  }

}
