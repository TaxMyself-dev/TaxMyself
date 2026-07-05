import {} from '@angular/common/http';
import { Component, computed, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { MenuItem } from 'primeng/api';
import { ReportWorkflowService } from 'src/app/services/report-workflow.service';
import { AccessService } from 'src/app/services/access.service';
import { AppFeature } from 'src/app/shared/access-control';

@Component({
  selector: 'app-book-keeping',
  templateUrl: './book-keeping.page.html',
  styleUrls: ['./book-keeping.page.scss', '../../shared/shared-styling.scss'],
  standalone: false,
})
export class BookKeepingPage implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly workflowService = inject(ReportWorkflowService);
  private readonly accessService = inject(AccessService);

  private readonly allItems: MenuItem[] = [
    { label: 'מסמכים שהפקתי', icon: 'pi pi-wallet', routerLink: 'incomes' },
    { label: 'הוצאות', icon: 'pi pi-arrow-down', routerLink: 'expenses' },
    { label: 'לקוחות', icon: 'pi pi-users', routerLink: 'clients' },
    { label: 'ספקים', icon: 'pi pi-building', routerLink: 'suppliers' },
  ];

  readonly items = computed<MenuItem[]>(() => {
    const showDocuments = this.accessService.getFeatureState(AppFeature.DOCUMENTS_LIST_TAB).visible;
    const showExpenses  = this.accessService.getFeatureState(AppFeature.EXPENSES_LIST_TAB).visible;
    return this.allItems.filter(item => {
      if (item.routerLink === 'incomes')  return showDocuments;
      if (item.routerLink === 'expenses') return showExpenses;
      return true;
    });
  });

  private readonly activeRouterLink = signal<string>('incomes');

  readonly activeItem = computed<MenuItem | undefined>(() =>
    this.items().find(item => item.routerLink === this.activeRouterLink())
  );

  private routeSub?: Subscription;
  private pendingSub?: Subscription;

  constructor() {
    // Update active tab when the route changes.
    this.routeSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((event: any) => {
        const url = event.urlAfterRedirects as string;
        if (url.includes('/incomes'))   this.activeRouterLink.set('incomes');
        else if (url.includes('/expenses'))  this.activeRouterLink.set('expenses');
        else if (url.includes('/clients'))   this.activeRouterLink.set('clients');
        else if (url.includes('/suppliers')) this.activeRouterLink.set('suppliers');
      });
  }

  ngOnInit() {
    // Tasks tab temporarily hidden — pending-count badge logic disabled with it.
    // // Reflect the pending-task count on the tasks tab as a small numeric badge.
    // this.pendingSub = this.workflowService.pendingCount$.subscribe((count) => {
    //   this.items[4] = {
    //     ...this.items[4],
    //     badge: count > 0 ? String(count) : undefined,
    //   };
    //   // Replace the array reference so PrimeNG's tabmenu picks up the change.
    //   this.items = [...this.items];
    //   // Keep activeItem reference consistent if the tasks tab is currently active.
    //   if (this.activeItem()?.routerLink === 'tasks') {
    //     this.activeItem.set(this.items[4]);
    //   }
    // });
    // // Initial fetch — fire-and-forget, errors logged by the service.
    // this.workflowService.refreshPendingCount().subscribe({ error: () => {} });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.pendingSub?.unsubscribe();
  }
}
