import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ShaamService } from 'src/app/services/shaam.service';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { catchError, EMPTY } from 'rxjs';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonSize, ButtonColor } from 'src/app/components/button/button.enum';
import { environment } from 'src/environments/environment';

interface ShaamTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string | null;
  scope?: string | null;
}

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
  private shaamService = inject(ShaamService);
  private messageService = inject(MessageService);

  readonly buttonSize = ButtonSize;
  readonly buttonColor = ButtonColor;

  isLoading = true;
  isSuccess = false;
  isError = false;
  errorMessage = '';

  ngOnInit() {
    // Get query parameters from SHAAM redirect or backend redirect
    this.route.queryParams.subscribe(params => {
      const code = params['code'];
      const state = params['state'];
      const response = params['response']; // Full response from backend
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

      // If full response is provided (from backend redirect), use it directly
      if (response) {
        try {
          const decodedResponse = decodeURIComponent(response);
          const tokenResponse: ShaamTokenResponse = JSON.parse(decodedResponse);
          this.handleTokenReceived(tokenResponse);
          return;
        } catch (e) {
          console.error('Error parsing token response:', e);
          this.isLoading = false;
          this.isError = true;
          this.errorMessage = 'שגיאה בפענוח התשובה משעמ';
          return;
        }
      }

      // Handle success - exchange code for token
      if (code && state) {
        this.exchangeCodeForToken(code, state);
      } else {
        this.isLoading = false;
        this.isError = true;
        this.errorMessage = 'Missing authorization code or state';
        this.messageService.add({
          severity: 'error',
          summary: 'שגיאה',
          detail: 'קוד האישור חסר',
          life: 5000,
          key: 'br',
        });
      }
    });
  }

  private handleTokenReceived(tokenResponse: ShaamTokenResponse): void {
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

  private exchangeCodeForToken(code: string, state: string): void {
    this.shaamService.exchangeCodeForToken(code, state)
      .pipe(
        catchError(err => {
          console.error('Error exchanging code for token:', err);
          this.isLoading = false;
          this.isError = true;
          this.errorMessage = err.error?.message || 'Failed to exchange code for token';
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: 'לא הצלחנו לקבל את הטוקן. אנא נסה שוב.',
            life: 5000,
            key: 'br',
          });
          return EMPTY;
        })
      )
      .subscribe(response => {
        // Convert to ShaamTokenResponse format
        const tokenResponse: ShaamTokenResponse = {
          access_token: response.accessToken,
          token_type: response.tokenType,
          expires_in: response.expiresIn,
          refresh_token: null,
          scope: null,
        };
        this.handleTokenReceived(tokenResponse);
      });
  }

  navigateToHome(): void {
    this.router.navigate(['/my-account']);
  }

  navigateToDocCreate(): void {
    this.router.navigate(['/doc-create']);
  }

  tryAgain(): void {
    this.shaamService.initiateOAuthFlow();
  }
}

