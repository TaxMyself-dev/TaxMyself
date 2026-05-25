import {} from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { MenuItem } from 'primeng/api';
import { ReportWorkflowService } from 'src/app/services/report-workflow.service';

@Component({
  selector: 'app-book-keeping',
  templateUrl: './book-keeping.page.html',
  styleUrls: ['./book-keeping.page.scss', '../../shared/shared-styling.scss'],
  standalone: false,
})
export class BookKeepingPage implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly workflowService = inject(ReportWorkflowService);

  items: MenuItem[] = [
    { label: 'מסמכים שהפקתי', icon: 'pi pi-wallet', routerLink: 'incomes' },
    { label: 'הוצאות', icon: 'pi pi-arrow-down', routerLink: 'expenses' },
    { label: 'לקוחות', icon: 'pi pi-users', routerLink: 'clients' },
    { label: 'ספקים', icon: 'pi pi-building', routerLink: 'suppliers' },
    { label: 'המשימות שלי', icon: 'pi pi-bell', routerLink: 'tasks' },
  ];

  activeItem = signal(this.items[0]);

  private routeSub?: Subscription;
  private pendingSub?: Subscription;

  constructor() {
    // Update active tab when the route changes.
    this.routeSub = this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe((event: any) => {
        const url = event.urlAfterRedirects as string;
        if (url.includes('/incomes')) this.activeItem.set(this.items[0]);
        else if (url.includes('/expenses')) this.activeItem.set(this.items[1]);
        else if (url.includes('/clients')) this.activeItem.set(this.items[2]);
        else if (url.includes('/suppliers')) this.activeItem.set(this.items[3]);
        else if (url.includes('/tasks')) this.activeItem.set(this.items[4]);
      });
  }

  ngOnInit() {
    // Reflect the pending-task count on the tasks tab as a small numeric badge.
    this.pendingSub = this.workflowService.pendingCount$.subscribe((count) => {
      this.items[4] = {
        ...this.items[4],
        badge: count > 0 ? String(count) : undefined,
      };
      // Replace the array reference so PrimeNG's tabmenu picks up the change.
      this.items = [...this.items];
      // Keep activeItem reference consistent if the tasks tab is currently active.
      if (this.activeItem()?.routerLink === 'tasks') {
        this.activeItem.set(this.items[4]);
      }
    });
    // Initial fetch — fire-and-forget, errors logged by the service.
    this.workflowService.refreshPendingCount().subscribe({ error: () => {} });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
    this.pendingSub?.unsubscribe();
  }
}
