import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-handle-error',
  templateUrl: './handle-error.component.html',
  styleUrls: ['./handle-error.component.scss'],
})
export class HandleErrorComponent  implements OnInit {

  @Input() textError: string;

  constructor() { }

  ngOnInit() {}

}
