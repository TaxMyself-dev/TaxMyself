import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonSize, ButtonColor } from 'src/app/components/button/button.enum';
import { environment } from 'src/environments/environment';
import { AccessHandlerService } from 'src/app/services/access-handler.service';
import { AppFeature } from 'src/app/shared/access-control';
import {
  SHAAM_OAUTH_ORIGIN_STORAGE_KEY,
  ShaamOAuthOrigin,
} from 'src/app/services/shaam.service';

@Component({
  selector: 'app-shaam-callback',
  templateUrl: './shaam-callback.page.html',
  styleUrls: ['./shaam-callback.page.scss'],
  standalone: true,
  imports: [CommonModule, ButtonComponent, ToastModule],
})
export class ShaamCallbackPage implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private accessHandlerService = inject(AccessHandlerService);
  private messageService = inject(MessageService);

  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;

  isLoading = true;
  isSuccess = false;
  isError = false;
  errorMessage = '';
  connectionOrigin: ShaamOAuthOrigin = 'document';

  get isSettingsOrigin(): boolean {
    return this.connectionOrigin === 'settings';
  }

  get isUniformFileOrigin(): boolean {
    return this.connectionOrigin === 'uniform-file';
  }

  ngOnInit() {
    this.connectionOrigin = this.consumeConnectionOrigin();
    // Get query parameters from SHAAM redirect or backend redirect
    this.route.queryParams.subscribe(params => {
      const connected = params['connected'];
      const error = params['error'];
      const errorDescription = params['error_description'];

      // Handle error from SHAAM or backend
      if (error) {
        this.isLoading = false;
        this.isError = true;
        this.errorMessage = decodeURIComponent(errorDescription || error || 'Authorization failed');
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: `האישור נכשל: ${this.errorMessage}`,
          life: 5000,
          key: 'br',
        });
        return;
      }

      if (connected === 'true') {
        this.handleConnected();
        return;
      }

      this.isLoading = false;
      this.isError = true;
      this.errorMessage = 'Missing connection result';
    });
  }

  private handleConnected(): void {
    this.isLoading = false;
    this.isSuccess = true;

    // Token is now stored in the database, no need to store in localStorage
    // Clear any old localStorage tokens
    localStorage.removeItem('shaam_access_token');
    localStorage.removeItem('shaam_token_expires_in');
    localStorage.removeItem('shaam_token_timestamp');

    this.messageService.add({
      severity: 'success',
      summary: 'הצלחה',
      detail: 'החיבור ל-SHAAM הושלם בהצלחה!',
      life: 3000,
      key: 'br',
    });
  }

  navigateToHome(): void {
    this.router.navigate(['/my-account']);
  }

  navigateToDocCreate(): void {
    const result = this.accessHandlerService.handleFeatureAccess(AppFeature.DOC_CREATE_BUTTON_PIVOT);
    if (result.allowed) {
      this.router.navigate(['/doc-create']);
    }
  }

  navigateToSettings(): void {
    this.router.navigate(['/settings'], { queryParams: { tab: 'permissions' } });
  }

  navigateToUniformFile(): void {
    this.router.navigate(['/uniform-file']);
  }

  tryAgain(): void {
    this.navigateToHome();
  }

  private consumeConnectionOrigin(): ShaamOAuthOrigin {
    const storedOrigin = sessionStorage.getItem(SHAAM_OAUTH_ORIGIN_STORAGE_KEY);
    sessionStorage.removeItem(SHAAM_OAUTH_ORIGIN_STORAGE_KEY);
    if (storedOrigin === 'settings' || storedOrigin === 'uniform-file') {
      return storedOrigin;
    }
    return 'document';
  }
}

