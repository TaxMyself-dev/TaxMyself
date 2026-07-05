import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Dialog } from 'primeng/dialog';
import { UpgradeRequiredService } from '../../services/upgrade-required.service';

@Component({
  selector: 'app-upgrade-required-dialog',
  standalone: true,
  imports: [Dialog],
  templateUrl: './upgrade-required-dialog.component.html',
  styleUrl: './upgrade-required-dialog.component.scss',
})
export class UpgradeRequiredDialogComponent {
  protected readonly upgradeService = inject(UpgradeRequiredService);
  private readonly router = inject(Router);

  protected readonly dialogHeader = computed(() => {
    const name = this.upgradeService.context()?.displayName;
    return name ? `${name} אינו כלול בתוכנית שלך` : 'שדרוג נדרש';
  });

  navigateToPlans(): void {
    this.upgradeService.close();
    this.router.navigate(['/billing/plans']);
  }

  close(): void {
    this.upgradeService.close();
    // this.router.navigate(['/my-account']);
  }
}
