import { Component, Input, OnInit } from '@angular/core';

@Component({
  selector: 'app-add-bill',
  templateUrl: './add-bill.component.html',
  styleUrls: ['./add-bill.component.scss'],
})
export class AddBillComponent  implements OnInit {

  @Input() paymentMethod: string;

  existBill: boolean = true;
  constructor() { }

  ngOnInit() {}

  clicked(event): void {
    const choose = event.target.value;
    console.log("click");
    console.log(event.target.value);
    choose === "new" ? this.existBill = false : this.existBill = true;
  }

}
