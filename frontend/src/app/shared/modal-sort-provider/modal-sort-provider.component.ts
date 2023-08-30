import { Component, Input, OnInit } from '@angular/core';
import { ModalController } from '@ionic/angular';


@Component({
  selector: 'app-modal-sort-provider',
  templateUrl: './modal-sort-provider.component.html',
  styleUrls: ['./modal-sort-provider.component.scss'],
})
export class ModalSortProviderComponent  implements OnInit {

  @Input() matches: any = [];

  constructor(private modalCtrl: ModalController) { }


  dismissModal() {
    this.modalCtrl.dismiss(null, 'cancel');
  }

  returnSelctedProvider (prov: any) {
    console.log("prov from modal" ,prov);
    
    const returnVal = prov;
    this.modalCtrl.dismiss({
      role: 'success',
      data: prov
    });
  }
  ngOnInit() {}

}
