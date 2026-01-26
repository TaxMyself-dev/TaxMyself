import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ShaamService } from 'src/app/services/shaam.service';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { catchError, EMPTY } from 'rxjs';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonSize, ButtonColor } from 'src/app/components/button/button.enum';

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

  ngOnInit() {
    // Get query parameters from SHAAM redirect or backend redirect
    this.route.queryParams.subscribe(params => {
      const code = params['code'];
      const state = params['state'];
      const token = params['token'];
      const expiresIn = params['expires_in'];
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

      // If token is already provided (from backend redirect), use it directly
      if (token) {
        this.handleTokenReceived(token, expiresIn ? parseInt(expiresIn) : 0);
        return;
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

  private handleTokenReceived(token: string, expiresIn: number): void {
    this.isLoading = false;
    this.isSuccess = true;
    this.accessToken = token;
    this.expiresIn = expiresIn;

    // Store token in localStorage (you may want to use a more secure storage)
    localStorage.setItem('shaam_access_token', token);
    localStorage.setItem('shaam_token_expires_in', expiresIn.toString());
    localStorage.setItem('shaam_token_timestamp', Date.now().toString());

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
        this.handleTokenReceived(response.accessToken, response.expiresIn);
      });
  }

  navigateToHome(): void {
    this.router.navigate(['/my-account']);
  }

  tryAgain(): void {
    this.shaamService.initiateOAuthFlow();
  }
}

