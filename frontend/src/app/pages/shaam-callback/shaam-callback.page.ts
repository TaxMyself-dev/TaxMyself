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
  accessToken = '';
  expiresIn = 0;
  fullTokenResponse: ShaamTokenResponse | null = null;
  curlCommand = '';

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
    this.accessToken = tokenResponse.access_token;
    this.expiresIn = tokenResponse.expires_in;
    this.fullTokenResponse = tokenResponse;

    // Store token in localStorage (you may want to use a more secure storage)
    localStorage.setItem('shaam_access_token', tokenResponse.access_token);
    localStorage.setItem('shaam_token_expires_in', tokenResponse.expires_in.toString());
    localStorage.setItem('shaam_token_timestamp', Date.now().toString());

    // Build CURL command for allocation number request
    this.buildCurlCommand(tokenResponse.access_token);

    this.messageService.add({
      severity: 'success',
      summary: 'הצלחה',
      detail: 'החיבור ל-SHAAM הושלם בהצלחה!',
      life: 3000,
      key: 'br',
    });
  }

  private buildCurlCommand(accessToken: string): void {
    // Prepare demo request data (with default values)
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const demoRequest = {
      accounting_software_number: 123456,
      amount_before_discount: 1000.00,
      customer_vat_number: 304902133,
      discount: 0.00,
      invoice_date: today,
      invoice_id: `DEMO-${Date.now()}`,
      invoice_issuance_date: today,
      invoice_reference_number: `REF-${Date.now()}`,
      invoice_type: 1,
      payment_amount: 1000.00,
      payment_amount_including_vat: 1180.00,
      vat_amount: 180.00,
      vat_number: 204245724,
    };

    const apiUrl = `${environment.apiUrl}shaam/invoices/approval`;
    const clientId = 'YOUR_CLIENT_ID_HERE'; // Replace with your actual CLIENT_ID

    // Build CURL command with proper formatting
    const requestBody = JSON.stringify(demoRequest, null, 2);
    const curlCommand = `curl -X POST "${apiUrl}" \\\n` +
      `  -H "Authorization: Bearer ${accessToken}" \\\n` +
      `  -H "Content-Type: application/json" \\\n` +
      `  -H "Accept: application/json" \\\n` +
      `  -H "X-IBM-Client-Id: ${clientId}" \\\n` +
      `  -d '${requestBody.replace(/'/g, "'\\''")}'`;

    this.curlCommand = curlCommand;
  }

  copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text).then(() => {
      this.messageService.add({
        severity: 'success',
        summary: 'הועתק',
        detail: 'הטקסט הועתק ללוח',
        life: 2000,
        key: 'br',
      });
    }).catch(err => {
      console.error('Failed to copy:', err);
    });
  }

  getTokenResponseAsJson(): string {
    if (!this.fullTokenResponse) {
      return '';
    }
    return JSON.stringify(this.fullTokenResponse, null, 2);
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

  tryAgain(): void {
    this.shaamService.initiateOAuthFlow();
  }
}

