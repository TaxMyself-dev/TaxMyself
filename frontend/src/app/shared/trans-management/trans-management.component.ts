import { Component, OnInit, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { catchError, EMPTY, finalize } from 'rxjs';
import { AdminPanelService } from 'src/app/services/admin-panel.service';
import { GenericService } from 'src/app/services/generic.service';
import { FeezbackService } from 'src/app/services/feezback.service';
import { SyncStatusService } from 'src/app/services/sync-status.service';
import { MessageService } from 'primeng/api';
import { environment } from 'src/environments/environment';

type SimScenario = 'success' | 'allFailed' | 'partialSync' | 'partialConsent';

@Component({
    selector: 'app-trans-management',
    templateUrl: './trans-management.component.html',
    styleUrls: ['./trans-management.component.scss'],
    standalone: false
})
export class TransManagementComponent  implements OnInit {

  fisiteDataForm: FormGroup;

  isLoadingConsentLink = signal<boolean>(false);
  isLoadingUserAccounts = signal<boolean>(false);
  isLoadingBankTransactions = signal<boolean>(false);
  isLoadingCardTransactions = signal<boolean>(false);
  isLoadingAllTransactions = signal<boolean>(false);

  consentDialogVisible = signal<boolean>(false);
  consentChecked = signal<boolean>(false);

  /** Dev-only sync simulator panel — hidden in production. */
  readonly showSimPanel = !environment.production;
  isLoadingSim = signal<SimScenario | 'reset' | null>(null);

  constructor(
    private genericService: GenericService,
    private formBuilder: FormBuilder,
    private adminPanelService: AdminPanelService,
    private feezbackService: FeezbackService,
    private syncStatusService: SyncStatusService,
    private messageService: MessageService,
    private router: Router,
  ) {
    this.fisiteDataForm = this.formBuilder.group({
      startDate: new FormControl(
        '', Validators.required,
      ),
      endDate: new FormControl(
        '', Validators.required,
      ),
      finsiteId: new FormControl(
        '', [],
      ),
     })
  }

  ngOnInit() {}



  getTransFromApi(): void {
    this.genericService.getLoader().subscribe();
    const formData = this.fisiteDataForm.value;
    console.log(formData);
    this.adminPanelService.getTransFromApi(formData)
    .pipe(
      finalize(() => this.genericService.dismissLoader()),
      catchError((error) => {
        console.log("error in get trans from api: ", error);
        return EMPTY;
      })
    )
    .subscribe((res) => {
      console.log("res of get trans from api: ", res);
    })
  }

  getAllUsersDataFromFinsite(): void {
    this.genericService.getLoader().subscribe();
    this.adminPanelService.getAllUsersDataFromFinsite()
    .pipe(
      finalize(() => this.genericService.dismissLoader()),
      catchError((error) => {
        console.log("error in getAllUsersDataFromFinsite: ", error);
        return EMPTY;
      })
    )
    .subscribe((res) => {
      console.log(res);
    })
  }

  connectToOpenBanking(): void {
    this.consentChecked.set(false);
    this.consentDialogVisible.set(true);
  }

  confirmConsentAndConnect(): void {
    this.consentDialogVisible.set(false);
    this.doConnectToOpenBanking();
  }

  private doConnectToOpenBanking(): void {
    this.isLoadingConsentLink.set(true);
    this.feezbackService.createConsentLink()
      .pipe(
        catchError(err => {
          console.error('Error creating consent link:', err);
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'לא הצלחנו ליצור קישור לחיבור.', life: 5000, key: 'br' });
          return EMPTY;
        }),
        finalize(() => this.isLoadingConsentLink.set(false))
      )
      .subscribe(response => {
        const link = response?.link || response?.url || response;
        if (link && typeof link === 'string') {
          window.location.assign(link);
        } else {
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'תגובה לא צפויה מהשרת.', life: 5000, key: 'br' });
        }
      });
  }

  fetchUserAccounts(): void {
    this.isLoadingUserAccounts.set(true);
    this.feezbackService.getUserAccounts()
      .pipe(
        catchError(err => {
          console.error('Error fetching accounts:', err);
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'לא הצלחנו לטעון נתוני חשבונות.', life: 5000, key: 'br' });
          return EMPTY;
        }),
        finalize(() => this.isLoadingUserAccounts.set(false))
      )
      .subscribe(response => {
        const count = response?.accounts?.length ?? 0;
        this.messageService.add({ severity: 'success', summary: 'הצלחה', detail: `נטענו ${count} חשבונות בהצלחה`, life: 3000, key: 'br' });
      });
  }

  fetchUserBankTransactions(): void {
    this.isLoadingBankTransactions.set(true);
    this.feezbackService.getUserBankTransactions('booked')
      .pipe(
        catchError(err => {
          console.error('Error fetching bank transactions:', err);
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'לא הצלחנו לטעון תנועות בנק.', life: 5000, key: 'br' });
          return EMPTY;
        }),
        finalize(() => this.isLoadingBankTransactions.set(false))
      )
      .subscribe(response => {
        this.showSyncToast(response?.syncSummary);
      });
  }

  fetchUserCardTransactions(): void {
    this.isLoadingCardTransactions.set(true);
    this.feezbackService.getUserCardTransactions('booked')
      .pipe(
        catchError(err => {
          console.error('Error fetching card transactions:', err);
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'לא הצלחנו לטעון תנועות אשראי.', life: 5000, key: 'br' });
          return EMPTY;
        }),
        finalize(() => this.isLoadingCardTransactions.set(false))
      )
      .subscribe(response => {
        this.showSyncToast(response?.syncSummary);
      });
  }

  fetchAllUserTransactions(): void {
    this.isLoadingAllTransactions.set(true);
    this.feezbackService.getAllUserTransactions('booked')
      .pipe(
        catchError(err => {
          console.error('Error fetching all transactions:', err);
          this.messageService.add({ severity: 'error', summary: 'שגיאה', detail: 'לא הצלחנו לטעון תנועות בנק ואשראי.', life: 5000, key: 'br' });
          return EMPTY;
        }),
        finalize(() => this.isLoadingAllTransactions.set(false))
      )
      .subscribe(response => {
        this.showSyncToast(response?.syncSummary);
      });
  }

  private showSyncToast(syncSummary: any): void {
    if (!syncSummary) {
      this.messageService.add({ severity: 'warn', summary: 'התראה', detail: 'לא נמצאו תנועות.', life: 5000, key: 'br' });
      return;
    }
    const bank = syncSummary.bank;
    const card = syncSummary.card;
    const system = syncSummary.system;
    const hasBank = bank?.transactionsFetched > 0;
    const hasCard = card?.transactionsFetched > 0;
    if (!hasBank && !hasCard) {
      this.messageService.add({ severity: 'warn', summary: 'התראה', detail: 'לא נמצאו תנועות בנק או אשראי.', life: 5000, key: 'br' });
      return;
    }
    const lines: string[] = ['הייבוא הושלם בהצלחה.'];
    if (hasBank) lines.push(`נטענו ${bank.transactionsFetched} תנועות בנק מ־${bank.banksProcessed} חשבונות.`);
    if (hasCard) lines.push(`נטענו ${card.transactionsFetched} תנועות כרטיסי אשראי מ־${card.cardsProcessed} כרטיסים.`);
    lines.push(`בסך הכול עובדו ${system.totalProcessed} תנועות: ${system.savedInCurrentImport} נשמרו, ${system.alreadyExisting} כבר קיימות.`);
    this.messageService.add({ severity: 'success', summary: 'הצלחה', detail: lines.join('\n'), life: 8000, key: 'br' });
  }

  // ───────────────────────────────────────────────────────────────────────────
  //  Dev-only sync scenario simulator
  // ───────────────────────────────────────────────────────────────────────────

  runSimulation(scenario: SimScenario): void {
    this.isLoadingSim.set(scenario);
    this.syncStatusService.simulateScenario(scenario)
      .pipe(
        catchError(err => {
          console.error('[DevSim] simulateScenario failed:', err);
          this.messageService.add({
            severity: 'error', summary: 'שגיאה', life: 5000, key: 'br',
            detail: 'לא הצלחנו להפעיל סימולציה. בדוק שהשרת רץ ב-development.',
          });
          return EMPTY;
        }),
        finalize(() => this.isLoadingSim.set(null)),
      )
      .subscribe(() => {
        // Open the my-account dialog with simulate=true so initFeezbackDialogFromReturnUrl
        // bypasses the real triggerPostConsentSync and just polls the seeded state.
        void this.router.navigate(['/my-account'], {
          queryParams: { feezbackStatus: 'success', simulate: 'true' },
        });
      });
  }

  resetSimulation(): void {
    this.isLoadingSim.set('reset');
    this.syncStatusService.resetSim()
      .pipe(
        catchError(err => {
          console.error('[DevSim] resetSim failed:', err);
          this.messageService.add({
            severity: 'error', summary: 'שגיאה', life: 5000, key: 'br',
            detail: 'לא הצלחנו לאפס את הסימולציה.',
          });
          return EMPTY;
        }),
        finalize(() => this.isLoadingSim.set(null)),
      )
      .subscribe(() => {
        this.messageService.add({
          severity: 'success', summary: 'הצלחה', life: 3000, key: 'br',
          detail: 'מצב הסימולציה אופס.',
        });
      });
  }
}
