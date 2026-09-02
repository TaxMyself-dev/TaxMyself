import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
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

  ngOnInit(): void {
    this.inboundEmailService.getMyAddresses().subscribe({
      next: addresses => {
        this.addresses.set(addresses);
        this.loading.set(false);
      },
      error: () => {
        this.loadError.set(true);
        this.loading.set(false);
      },
    });
  }

  async copy(address: string): Promise<void> {
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
