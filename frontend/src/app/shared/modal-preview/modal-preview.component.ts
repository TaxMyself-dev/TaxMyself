import { Component, Input, OnInit } from '@angular/core';


@Component({
  selector: 'app-modal-preview',
  templateUrl: './modal-preview.component.html',
  styleUrls: ['./modal-preview.component.scss'],
})
export class ModalPreviewComponent  implements OnInit {
  
  @Input() fileUrl: string = "";


  constructor() { }

  ngOnInit() {
    console.log(this.fileUrl);
    
  }


}
