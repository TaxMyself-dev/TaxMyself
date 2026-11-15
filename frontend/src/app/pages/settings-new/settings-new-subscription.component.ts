import { CommonModule } from '@angular/common';
import { Component, computed, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonComponent } from '../../components/button/button.component';
import { ChangePaymentMethodDialogComponent } from '../../components/change-payment-method-dialog/change-payment-method-dialog.component';
import { GenericTableComponent } from '../../components/generic-table/generic-table.component';
import { MySubscriptionTabComponent } from '../settings/my-subscription-tab/my-subscription-tab.component';

/** New presentation, existing subscription lifecycle and payment handlers. */
@Component({
  selector: 'app-settings-new-subscription', standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent, ChangePaymentMethodDialogComponent, GenericTableComponent],
  templateUrl: './settings-new-subscription.component.html',
  styleUrls: ['./settings-new-subscription.component.scss'],
})
export class SettingsNewSubscriptionComponent extends MySubscriptionTabComponent {
  readonly navigateSection = output<'history'>();
  readonly isMastercard = computed(() => /master\s?card/i.test(this.paymentMethod()?.brand ?? ''));

  override changePaymentMethod(): void {
    if (this.billingStateServiceOverride() || this.isComplimentary()) return;
    super.changePaymentMethod();
  }
}
