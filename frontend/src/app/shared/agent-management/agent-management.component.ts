import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { HmacHelperService } from 'src/app/services/hmac-helper.service';
import { ButtonComponent } from 'src/app/components/button/button.component';
import { ButtonSize, ButtonColor } from 'src/app/components/button/button.enum';
import { InputTextComponent } from 'src/app/components/input-text/input-text.component';
import { InputSelectComponent } from 'src/app/components/input-select/input-select.component';
import { AgentCredentialsModalComponent } from 'src/app/components/agent-credentials-modal/agent-credentials-modal.component';
import { MessageService } from 'primeng/api';
import { catchError, EMPTY, finalize } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from 'src/environments/environment';
import { ISelectItem } from 'src/app/shared/interface';

@Component({
  selector: 'app-agent-management',
  templateUrl: './agent-management.component.html',
  styleUrls: ['./agent-management.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonComponent,
    InputTextComponent,
    InputSelectComponent,
    AgentCredentialsModalComponent
  ]
})
export class AgentManagementComponent implements OnInit {
  formBuilder = inject(FormBuilder);
  adminPanelService = inject(AdminPanelService);
  hmacHelper = inject(HmacHelperService);
  http = inject(HttpClient);
  messageService = inject(MessageService);

  // Add Agent Form
  agentForm: FormGroup;
  isLoading = signal<boolean>(false);
  showCredentialsModal = signal<boolean>(false);
  credentials = signal<{ apiKey: string; secret: string } | null>(null);

  // Test Agent Form
  testAgentForm: FormGroup;
  isTesting = signal<boolean>(false);
  testResults = signal<any>(null);
  activeTestSection = signal<'ping' | 'register-customer' | 'create-document' | null>(null);

  // Agent credentials from environment
  testApiKey = signal<string>('');
  testSecret = signal<string>('');

  buttonSize = ButtonSize;
  buttonColor = ButtonColor;

  constructor() {
    // Add Agent Form
    this.agentForm = this.formBuilder.group({
      name: new FormControl('', [Validators.required, Validators.minLength(1)])
    });

    // Test Agent Form
    this.testAgentForm = this.formBuilder.group({
      apiKey: new FormControl('TVn2GAaNkDkZfcMQQ5lDH2t67iXi0b45wvPNEz9VILQ', [Validators.required]),
      secret: new FormControl('WrtQOcbQzuY49Gc8bS6zsUWbHF9bjMVM0wRRcS_wolo', [Validators.required]),
      // Register Customer fields with default values for testing
      externalCustomerId: new FormControl('17885', [Validators.required]),
      email: new FormControl('test' + '@example.com', [Validators.required, Validators.email]),
      id: new FormControl('123456789', [Validators.required]),
      phone: new FormControl('0501234567'),
      fName: new FormControl('יוחנן'),
      lName: new FormControl('כהן'),
      city: new FormControl(''), // מקום מגורים (אופציונלי)
      // Business fields
      businessName: new FormControl('עריכת וידאו'),
      businessNumber: new FormControl('555555555'),
      businessType: new FormControl('LICENSED'),
      businessAddress: new FormControl('רחוב הרצל 1, תל אביב', [Validators.required]), // כתובת העסק (חובה)
      // Document creation fields
      documentExternalCustomerId: new FormControl('17885', [Validators.required]), // External customer ID for document creation
      documentRecipientName: new FormControl('לקוח לדוגמה', [Validators.required]),
      documentAmount: new FormControl(1000, [Validators.required, Validators.min(0.01)]),
      documentDescription: new FormControl('שירותים מקצועיים'),
    });
  }

  // Business type options for select dropdown
  businessTypeOptions: ISelectItem[] = [
    { name: 'פטור', value: 'EXEMPT' },
    { name: 'מורשה', value: 'LICENSED' },
    { name: 'חברה', value: 'COMPANY' },
  ];

  ngOnInit() {
    // Load test agent credentials from environment or prompt user
    if (environment.testAgent?.apiKey && environment.testAgent?.secret) {
      this.testApiKey.set(environment.testAgent.apiKey);
      this.testSecret.set(environment.testAgent.secret);
      this.testAgentForm.patchValue({
        apiKey: environment.testAgent.apiKey,
        secret: environment.testAgent.secret
      });
    }
  }

  // ========== Add Agent Methods ==========
  onSubmit(): void {
    if (this.agentForm.invalid) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'אנא הזן שם סוכן',
        life: 3000,
        key: 'br'
      });
      return;
    }

    const name = this.agentForm.get('name')?.value?.trim();
    if (!name) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'אנא הזן שם סוכן תקין',
        life: 3000,
        key: 'br'
      });
      return;
    }

    this.isLoading.set(true);

    this.adminPanelService.addAgent(name)
      .pipe(
        finalize(() => this.isLoading.set(false)),
        catchError((err) => {
          console.error('Error adding agent:', err);
          this.messageService.add({
            severity: 'error',
            summary: 'שגיאה',
            detail: err.error?.message || 'לא הצלחנו להוסיף את הסוכן. אנא נסה שוב מאוחר יותר.',
            life: 5000,
            key: 'br'
          });
          return EMPTY;
        })
      )
      .subscribe({
        next: (response) => {
          if (response?.apiKey && response?.secret) {
            this.credentials.set({
              apiKey: response.apiKey,
              secret: response.secret
            });
            this.showCredentialsModal.set(true);
            this.agentForm.reset();
          } else {
            this.messageService.add({
              severity: 'error',
              summary: 'שגיאה',
              detail: 'התקבלה תגובה לא תקינה מהשרת',
              life: 5000,
              key: 'br'
            });
          }
        }
      });
  }

  onCredentialsModalClose(event: { visible: boolean }): void {
    this.showCredentialsModal.set(false);
    this.credentials.set(null);
  }

  // ========== Test Agent Methods ==========
  async testPing(): Promise<void> {
    const apiKey = this.testAgentForm.get('apiKey')?.value;
    const secret = this.testAgentForm.get('secret')?.value;

    if (!apiKey || !secret) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'אנא הזן API Key ו-Secret',
        life: 3000,
        key: 'br'
      });
      return;
    }

    this.isTesting.set(true);
    this.activeTestSection.set('ping');
    this.testResults.set(null);

    try {
      const method = 'GET';
      const path = '/agent/ping';
      const body = '';

      const headers = await this.hmacHelper.generateHmacHeaders(method, path, body, apiKey, secret);
      
      // Remove trailing slash from apiUrl and leading slash from path to avoid double slashes
      const baseUrl = environment.apiUrl.endsWith('/') ? environment.apiUrl.slice(0, -1) : environment.apiUrl;
      const fullPath = path.startsWith('/') ? path : `/${path}`;
      const fullUrl = `${baseUrl}${fullPath}`;
      
      const httpHeaders = new HttpHeaders(headers);
      const response = await this.http.get<any>(fullUrl, { headers: httpHeaders }).toPromise();

      this.testResults.set({
        success: true,
        endpoint: 'GET /agent/ping',
        response,
        timestamp: new Date().toISOString()
      });

      this.messageService.add({
        severity: 'success',
        summary: 'הצלחה',
        detail: 'בדיקת Ping הצליחה',
        life: 3000,
        key: 'br'
      });
    } catch (error: any) {
      console.error('Ping test error:', error);
      this.testResults.set({
        success: false,
        endpoint: 'GET /agent/ping',
        error: error.error || error.message || 'Unknown error',
        status: error.status,
        timestamp: new Date().toISOString()
      });

      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: error.error?.message || 'בדיקת Ping נכשלה',
        life: 5000,
        key: 'br'
      });
    } finally {
      this.isTesting.set(false);
    }
  }

  async testRegisterCustomer(): Promise<void> {
    const apiKey = this.testAgentForm.get('apiKey')?.value;
    const secret = this.testAgentForm.get('secret')?.value;
    const externalCustomerId = this.testAgentForm.get('externalCustomerId')?.value;
    const email = this.testAgentForm.get('email')?.value;
    const id = this.testAgentForm.get('id')?.value;
    const phone = this.testAgentForm.get('phone')?.value;
    const fName = this.testAgentForm.get('fName')?.value;
    const lName = this.testAgentForm.get('lName')?.value;
    const city = this.testAgentForm.get('city')?.value;
    const businessName = this.testAgentForm.get('businessName')?.value;
    const businessNumber = this.testAgentForm.get('businessNumber')?.value;
    const businessType = this.testAgentForm.get('businessType')?.value;
    const businessAddress = this.testAgentForm.get('businessAddress')?.value;

    if (!apiKey || !secret || !externalCustomerId || !email || !id) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'אנא מלא את כל השדות הנדרשים (email, id)',
        life: 3000,
        key: 'br'
      });
      return;
    }

    this.isTesting.set(true);
    this.activeTestSection.set('register-customer');
    this.testResults.set(null);

    try {
      const method = 'PUT';
      const path = `/agent/customers/${externalCustomerId}`;
      const requestBody: any = {
        email,
        id, // Mandatory field
        phone: phone || undefined,
        fName: fName || undefined,
        lName: lName || undefined,
        city: city || undefined, // מקום מגורים (אופציונלי)
      };

      // Add business fields if provided
      if (businessName && businessNumber && businessType) {
        requestBody.businessName = businessName;
        requestBody.businessNumber = businessNumber;
        requestBody.businessType = businessType;
        requestBody.businessAddress = businessAddress; // כתובת העסק (חובה)
      }

      const body = JSON.stringify(requestBody);

      const headers = await this.hmacHelper.generateHmacHeaders(method, path, body, apiKey, secret);
      
      // Remove trailing slash from apiUrl and leading slash from path to avoid double slashes
      const baseUrl = environment.apiUrl.endsWith('/') ? environment.apiUrl.slice(0, -1) : environment.apiUrl;
      const fullPath = path.startsWith('/') ? path : `/${path}`;
      const fullUrl = `${baseUrl}${fullPath}`;
      
      const httpHeaders = new HttpHeaders(headers);
      const response = await this.http.put<any>(
        fullUrl,
        requestBody,
        { headers: httpHeaders }
      ).toPromise();

      this.testResults.set({
        success: true,
        endpoint: `PUT /agent/customers/${externalCustomerId}`,
        request: requestBody,
        response,
        timestamp: new Date().toISOString()
      });

      this.messageService.add({
        severity: 'success',
        summary: 'הצלחה',
        detail: `לקוח ${response.created ? 'נוצר' : 'קיים כבר'} בהצלחה`,
        life: 3000,
        key: 'br'
      });
    } catch (error: any) {
      console.error('Register customer test error:', error);
      this.testResults.set({
        success: false,
        endpoint: `PUT /agent/customers/${externalCustomerId}`,
        request: { email, id, phone, fName, lName, city, businessName, businessNumber, businessType, businessAddress },
        error: error.error || error.message || 'Unknown error',
        status: error.status,
        timestamp: new Date().toISOString()
      });

      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: error.error?.message || 'רישום לקוח נכשל',
        life: 5000,
        key: 'br'
      });
    } finally {
      this.isTesting.set(false);
    }
  }

  async testCreateDocument(): Promise<void> {
    const apiKey = this.testAgentForm.get('apiKey')?.value;
    const secret = this.testAgentForm.get('secret')?.value;
    const externalCustomerId = this.testAgentForm.get('documentExternalCustomerId')?.value;
    const businessNumber = this.testAgentForm.get('businessNumber')?.value;
    const recipientName = this.testAgentForm.get('documentRecipientName')?.value;
    const amount = parseFloat(this.testAgentForm.get('documentAmount')?.value);
    const description = this.testAgentForm.get('documentDescription')?.value;

    if (!apiKey || !secret || !externalCustomerId || !businessNumber || !recipientName || !amount || amount <= 0) {
      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: 'אנא מלא את כל השדות הנדרשים (מספר עסק, שם לקוח, סכום)',
        life: 3000,
        key: 'br'
      });
      return;
    }

    this.isTesting.set(true);
    this.activeTestSection.set('create-document');
    this.testResults.set(null);

    try {
      // Calculate VAT (17%)
      const vatRate = 17;
      const sumBefDisBefVat = amount;
      const disSum = 0;
      const sumAftDisBefVat = sumBefDisBefVat - disSum;
      const vatSum = (sumAftDisBefVat * vatRate) / 100;
      const sumAftDisWithVat = sumAftDisBefVat + vatSum;

      // Build document data with default values for RECEIPT
      const docDate = new Date().toISOString().split('T')[0]; // Today's date in YYYY-MM-DD format
      const docNumber = '1000'; // Default document number
      const generalDocIndex = '1000000'; // Default general index

      const requestBody = {
        docData: {
          businessType: 'LICENSED', // Default business type
          docType: 'RECEIPT', // קבלה
          docNumber: docNumber,
          generalDocIndex: generalDocIndex,
          issuerBusinessNumber: businessNumber,
          docDescription: description || 'שירותים מקצועיים',
          docDate: docDate,
          docVatRate: vatRate,
          currency: 'ILS',
          recipientName: recipientName,
          totalVatApplicable: vatSum,
          totalWithoutVat: sumAftDisBefVat,
          totalDiscount: disSum,
          totalVat: vatSum,
        },
        linesData: [
          {
            lineNumber: 1,
            docType: 'RECEIPT',
            description: description || 'שירותים מקצועיים',
            unitQuantity: 1,
            sum: sumBefDisBefVat,
            discount: disSum,
            vatOpts: 'EXCLUDE',
            vatRate: vatRate,
            sumBefVatPerUnit: sumBefDisBefVat,
            disBefVatPerLine: disSum,
            sumAftDisBefVatPerLine: sumAftDisBefVat,
            vatPerLine: vatSum,
            sumAftDisWithVat: sumAftDisWithVat,
            unitType: 1,
          }
        ],
        paymentData: [
          {
            paymentLineNumber: 1,
            paymentDate: docDate,
            paymentSum: sumAftDisWithVat,
            paymentAmount: sumAftDisWithVat,
            paymentMethod: 'CASH', // מזומן
          }
        ]
      };

      const method = 'POST';
      const path = `/agent/customers/${externalCustomerId}/documents`;
      const body = JSON.stringify(requestBody);

      const headers = await this.hmacHelper.generateHmacHeaders(method, path, body, apiKey, secret);
      
      const baseUrl = environment.apiUrl.endsWith('/') ? environment.apiUrl.slice(0, -1) : environment.apiUrl;
      const fullPath = path.startsWith('/') ? path : `/${path}`;
      const fullUrl = `${baseUrl}${fullPath}`;
      
      const httpHeaders = new HttpHeaders(headers);
      const response = await this.http.post<any>(
        fullUrl,
        requestBody,
        { headers: httpHeaders }
      ).toPromise();

      this.testResults.set({
        success: true,
        endpoint: `POST /agent/customers/${externalCustomerId}/documents`,
        request: requestBody,
        response,
        timestamp: new Date().toISOString()
      });

      this.messageService.add({
        severity: 'success',
        summary: 'הצלחה',
        detail: `מסמך נוצר בהצלחה: ${response.docType} #${response.docNumber}`,
        life: 3000,
        key: 'br'
      });
    } catch (error: any) {
      console.error('Create document test error:', error);
      this.testResults.set({
        success: false,
        endpoint: `POST /agent/customers/${externalCustomerId}/documents`,
        request: { externalCustomerId, businessNumber, recipientName, amount, description },
        error: error.error || error.message || 'Unknown error',
        status: error.status,
        timestamp: new Date().toISOString()
      });

      this.messageService.add({
        severity: 'error',
        summary: 'שגיאה',
        detail: error.error?.message || 'יצירת מסמך נכשלה',
        life: 5000,
        key: 'br'
      });
    } finally {
      this.isTesting.set(false);
    }
  }

  clearTestResults(): void {
    this.testResults.set(null);
    this.activeTestSection.set(null);
  }
}

