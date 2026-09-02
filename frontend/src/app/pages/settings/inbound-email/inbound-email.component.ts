import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MessageService } from 'primeng/api';
import {
  InboundEmailAddress,
  InboundEmailService,
} from 'src/app/services/inbound-email.service';

@Component({
  selector: 'app-inbound-email',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './inbound-email.component.html',
  styleUrls: ['./inbound-email.component.scss'],
})
export class InboundEmailComponent implements OnInit {
  private readonly inboundEmailService = inject(InboundEmailService);
  private readonly messageService = inject(MessageService);

  readonly loading = signal(true);
  readonly addresses = signal<InboundEmailAddress[]>([]);
  readonly loadError = signal(false);
  readonly editing = signal<Record<string, boolean>>({});
  readonly drafts = signal<Record<string, string>>({});
  readonly saving = signal<Record<string, boolean>>({});
  readonly errors = signal<Record<string, string>>({});

  ngOnInit(): void {
    this.inboundEmailService.getMyAddresses().subscribe({
      next: addresses => {
        this.addresses.set(addresses);
        this.drafts.set(Object.fromEntries(addresses.map(item => [
          item.businessNumber,
          item.isLegacyGenerated
            ? item.suggestedLocalPart
            : (item.localPart ?? item.suggestedLocalPart),
        ])));
        this.editing.set(Object.fromEntries(addresses
          .filter(item => !item.address || item.isLegacyGenerated)
          .map(item => [item.businessNumber, true])));
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  setDraft(businessNumber: string, value: string): void {
    const normalized = value.toLowerCase().replace(/\s+/g, '-');
    this.drafts.update(drafts => ({ ...drafts, [businessNumber]: normalized }));
    this.clearError(businessNumber);
  }

  save(item: InboundEmailAddress): void {
    const localPart = (this.drafts()[item.businessNumber] ?? '').trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(localPart) || localPart.length < 3) {
      this.setError(item.businessNumber, 'יש להזין לפחות 3 תווים באנגלית, מספרים או מקפים.');
      return;
    }

    this.saving.update(value => ({ ...value, [item.businessNumber]: true }));
    this.inboundEmailService.updateAddress(item.businessNumber, localPart).subscribe({
      next: updated => {
        this.addresses.update(items => items.map(current =>
          current.businessNumber === updated.businessNumber ? updated : current,
        ));
        this.drafts.update(value => ({
          ...value,
          [item.businessNumber]: updated.localPart ?? '',
        }));
        this.editing.update(value => ({ ...value, [item.businessNumber]: false }));
        this.saving.update(value => ({ ...value, [item.businessNumber]: false }));
        this.messageService.add({
          severity: 'success',
          summary: 'כתובת המייל נשמרה',
          detail: updated.address ?? undefined,
          life: 3000,
          key: 'br',
        });
      },
      error: (error: HttpErrorResponse) => {
        this.saving.update(value => ({ ...value, [item.businessNumber]: false }));
        this.setError(
          item.businessNumber,
          error.status === 409
            ? 'הכתובת הזו כבר תפוסה. יש לבחור שם אחר.'
            : 'לא הצלחנו לשמור את הכתובת. נסה שוב.',
        );
      },
    });
  }

  private setError(businessNumber: string, message: string): void {
    this.errors.update(value => ({ ...value, [businessNumber]: message }));
  }

  private clearError(businessNumber: string): void {
    this.errors.update(value => ({ ...value, [businessNumber]: '' }));
  }

  async copy(address: string | null): Promise<void> {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      this.messageService.add({
        severity: 'success',
        summary: 'הכתובת הועתקה',
        detail: address,
        life: 2500,
        key: 'br',
      });
    } catch {
      this.messageService.add({
        severity: 'error',
        summary: 'לא הצלחנו להעתיק את הכתובת',
        life: 3000,
        key: 'br',
      });
    }
  }
}
