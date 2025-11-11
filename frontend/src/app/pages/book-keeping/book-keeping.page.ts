import {} from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { signal, effect } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { TabMenuModule } from 'primeng/tabmenu';
import { RouterModule } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
    selector: 'app-book-keeping',
    templateUrl: './book-keeping.page.html',
    styleUrls: ['./book-keeping.page.scss', '../../shared/shared-styling.scss'],
    standalone: false
})
export class BookKeepingPage implements OnInit {

  items = [
    { label: 'הכנסות', icon: 'pi pi-wallet', routerLink: 'incomes' },
    { label: 'הוצאות', icon: 'pi pi-arrow-down', routerLink: 'expenses' },
    { label: 'לקוחות', icon: 'pi pi-users', routerLink: 'clients' }
  ];

  activeItem = signal(this.items[0]);

  constructor(private router: Router){
     // Update active tab when the route changes
    this.router.events.pipe(filter(e => e instanceof NavigationEnd)).subscribe((event: any) => {
      const url = event.urlAfterRedirects;
      if (url.includes('/incomes')) this.activeItem.set(this.items[0]);
      else if (url.includes('/expenses')) this.activeItem.set(this.items[1]);
      else if (url.includes('/clients')) this.activeItem.set(this.items[2]);
    });
  }

  ngOnInit() {
  }


}
